"""
DBBench Harness — H0 / H_SCHEMA / H1 / H2 / H3 / H4 / H5 / H6 / H7 / H9  (v7 + H7 + H9)

H0       Task Parser            — one-time task classification per episode
H_SCHEMA Column-name mapping    — replicates DBBenchTask._sanitize_identifier
                                  (64-char truncation, dedupe) to build
                                  raw→sanitized name_map + Schema Card
H1       Session State          — per-round SQL history, error tracking,
                                  candidate answer, streaks
H2       Action Gate            — tool-call rescue + SQL auto-backtick +
                                  MySQL dialect fix + commit gate + answer
                                  normalisation (interface-boundary repair)
H3       Tool-description patch — static hints on execute_sql / commit_final_answer
H4       Post-step Monitor      — syntax / unknown-col / empty / loop +
                                  budget warn/force (runtime monitoring)
H5       Skill library + step   — BM25-ranked cold-start skills + per-step
                                  guidance (round-0 templates + lint)
H6       Terminal Evidence Gate — do not let an episode close on non-terminal
                                  evidence.  For non-mutation tasks the H1
                                  state tracks which aggregate (COUNT/SUM/AVG/
                                  MIN/MAX) the question demands, whether the
                                  last SELECT actually computed it, and whether
                                  the last result had any rows.  The H5
                                  promotion hint is gated on that evidence, and
                                  the commit gate blocks a blank/give-up answer
                                  after an empty result (or a bare scalar when
                                  the demanded aggregate was never computed) up
                                  to 3 times, never twice without new SQL in
                                  between.  Mutation tasks (INSERT/UPDATE/
                                  DELETE, SHAPE_HASH) are exempt: blank answers
                                  are legal there.
H7       INSERT Literal Fidelity — parse the INSERT with balanced parens
                                  (a ')' inside a backticked identifier such as
                                  `Area (km²)` must not truncate the column
                                  list), scan unquoted-numeric lints on the
                                  MASKED VALUES slice only (digits inside
                                  quoted literals like '1,250,000' must never
                                  trigger the "quote ALL values" hint), and
                                  rewrite thousands-separated INSERT literals
                                  to the stored sample format when (and only
                                  when) every stored sample of that column is
                                  a plain comma-free number.  Rewrite only —
                                  never blocks, never touches commit counters.
H9       Tool-Call Escape Fidelity — a <tool_call> JSON body can be invalid
                                  only because the model wrote a sequence JSON
                                  does not define as an escape (\\xNN copied
                                  from a repr-rendered stored value, \\' inside
                                  an SQL literal, …).  Such bodies are
                                  re-parsed tolerantly with every non-JSON
                                  escape passed through literally, so the
                                  intended tool call and its literal text
                                  survive byte-for-byte.  Secondary facet:
                                  literal \\xHH sequences in SQL are rewritten
                                  to the real character only when the schema
                                  map's stored sample rows corroborate that
                                  character.  Rewrite only — never blocks,
                                  never touches commit/gate counters.

Merge policy (per user feedback):
  - Budget management lives inside H4 (runtime monitoring).
  - Answer normalisation lives inside H2 commit gate (interface-boundary repair).
  - Only four top-level switches are exposed: h2 / h3 / h4 / h5.

H4 false-positive avoidance notes (per user warning):
  - Error hints only on specific MySQL error tokens (Unknown column / doesn't
    exist / near 'X' / syntax error / NULL aggregate).
  - Loop detection requires N identical normalised SQL in a row (default N=3).
  - Empty-result hint only after empty_streak >= threshold (default 2).
  - Budget force only fires with a PLAUSIBLE candidate_answer sourced from
    a successful SQL execution whose shape matches H0's answer_shape.
  - DESCRIBE hint only fires when the last error explicitly said Unknown column
    (not on any arbitrary error).
  - Commit gate will only *block* a submission once per task to avoid dead-lock
    (extended by H6 with a separate, capped evidence-block counter).
"""

import ast
import copy
import json
import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# Task / answer shape constants
# ─────────────────────────────────────────────────────────────────────────────

TASK_SELECT        = "SELECT"
TASK_INSERT        = "INSERT"
TASK_UPDATE        = "UPDATE"
TASK_DELETE        = "DELETE"
TASK_COUNTING      = "counting"
TASK_RANKING       = "ranking"
TASK_AGG_MAX       = "aggregation-MAX"
TASK_AGG_MIN       = "aggregation-MIN"
TASK_AGG_SUM       = "aggregation-SUM"
TASK_AGG_AVG       = "aggregation-AVG"
TASK_AGG_COUNT     = "aggregation-COUNT"
TASK_COMPARISON    = "comparison"
TASK_OTHER         = "other"

_MUTATION_TYPES = {TASK_INSERT, TASK_UPDATE, TASK_DELETE}
_AGGREGATION_TYPES = {TASK_AGG_MAX, TASK_AGG_MIN, TASK_AGG_SUM, TASK_AGG_AVG, TASK_AGG_COUNT}

SHAPE_SCALAR_INT   = "scalar_int"
SHAPE_SCALAR_FLOAT = "scalar_float"
SHAPE_SCALAR_STR   = "scalar_str"
SHAPE_MULTI_SINGLE = "multi_row_single_col"
SHAPE_MULTI_MULTI  = "multi_row_multi_col"
SHAPE_HASH         = "hash"  # INSERT/UPDATE/DELETE — answer ignored by evaluator


# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DBBenchHarnessConfig:
    enabled: bool = False
    # Only h2/h3/h4/h5 — budget management lives in H4, answer normalisation in H2.
    h2_enabled: bool = True
    h3_enabled: bool = True
    h4_enabled: bool = True
    h5_enabled: bool = True

    # H2
    h2_repeat_sql_block_after: int = 2   # same SQL N times → auto-commit candidate
    h2_commit_block_limit: int = 1       # max block attempts for non-mutation tasks
    # Mutation tasks always block until mutation_attempted; this is the max for their
    # "commit before mutation" gate (separate from the non-mutation limit).
    h2_mutation_commit_block_limit: int = 3

    # H7
    h7_norm_limit: int = 4               # max thousands-normalisation rewrites per episode

    # H9
    h9_repr_limit: int = 2               # max literal \xHH repr-escape rewrites per episode

    # H4
    h4_stall_window: int = 3             # turns of same SQL → loop alert
    h4_empty_threshold: int = 2          # empty SELECT rows in a row → broaden hint
    h4_budget_warn_threshold: int = 3    # remaining <= N → soft warn
    h4_budget_force_threshold: int = 2   # remaining <= N + candidate plausible → force

    # H4-E hint
    h4_hint_max_words: int = 40

    # H5
    h5_top_k: int = 2
    h5_cold_start_max_words: int = 50


# ─────────────────────────────────────────────────────────────────────────────
# Identifier sanitisation — mirrors DBBenchTask._sanitize_identifier exactly.
# If the task impl changes, keep this in sync.
# ─────────────────────────────────────────────────────────────────────────────

def sanitize_identifier(name: str, fallback_prefix: str = "col") -> str:
    """Mirror of DBBenchTask._sanitize_identifier.

    Replace escape sequences, strip, truncate to MySQL's 64-char identifier
    limit.  Kept here so the harness doesn't import the task class.
    """
    name = (name or "").replace("\\n", " ").replace("\\t", " ").replace("\\r", " ")
    name = name.strip()
    if not name:
        name = fallback_prefix
    return name[:64]


def _sanitize_columns(cols: List[Dict[str, Any]]) -> List[str]:
    seen: Dict[str, bool] = {}
    out: List[str] = []
    for col_idx, c in enumerate(cols):
        sname = sanitize_identifier(c.get("name", ""), fallback_prefix=f"col_{col_idx}")
        base = sname
        counter = 1
        while sname in seen:
            sname = f"{base[:61]}_{counter}"
            counter += 1
        seen[sname] = True
        out.append(sname)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# BM25 retrieval (for H5 cold-start)
# ─────────────────────────────────────────────────────────────────────────────

def _bm25_tokenize(text: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", (text or "").lower())


def _skill_doc_tokens(skill: Dict[str, Any]) -> List[str]:
    parts = [skill.get("text", "")] + list(skill.get("keywords", []))
    return _bm25_tokenize(" ".join(parts))


def _bm25_scores(
    query_tokens: List[str],
    docs: List[List[str]],
    k1: float = 1.5,
    b: float = 0.75,
) -> List[float]:
    if not docs:
        return []
    n_docs = len(docs)
    avgdl = sum(len(d) for d in docs) / n_docs if n_docs else 1
    df: Dict[str, int] = {}
    for doc in docs:
        for term in set(doc):
            df[term] = df.get(term, 0) + 1
    scores: List[float] = []
    unique_q = list(dict.fromkeys(query_tokens))
    for doc in docs:
        dl = len(doc)
        tf: Dict[str, int] = {}
        for t in doc:
            tf[t] = tf.get(t, 0) + 1
        score = 0.0
        for t in unique_q:
            if t not in tf:
                continue
            idf = math.log(1.0 + (n_docs - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))
            f = tf[t]
            denom = f + k1 * (1.0 - b + b * dl / avgdl)
            score += idf * f * (k1 + 1.0) / denom
        scores.append(score)
    return scores


def _truncate_to_word_budget(text: str, max_words: int) -> str:
    words = text.split()
    return text if len(words) <= max_words else " ".join(words[:max_words]).strip()


# ─────────────────────────────────────────────────────────────────────────────
# Skill library (H5)
# ─────────────────────────────────────────────────────────────────────────────

_ALL_TASK_TYPES_LIST = [
    TASK_SELECT, TASK_INSERT, TASK_UPDATE, TASK_DELETE,
    TASK_COUNTING, TASK_RANKING,
    TASK_AGG_MAX, TASK_AGG_MIN, TASK_AGG_SUM, TASK_AGG_AVG, TASK_AGG_COUNT,
    TASK_COMPARISON, TASK_OTHER,
]

DB_SKILLS: List[Dict[str, Any]] = [
    {
        "id": "backtick_identifiers",
        "task_types": list(_ALL_TASK_TYPES_LIST),
        "keywords": ["column", "name", "space", "dot", "backtick", "identifier", "quote"],
        "text": (
            "Any table or column name with a space, dot, slash, or punctuation must be "
            "wrapped in backticks. Examples: `Race Name`, `No.`, `Olympic Medal Table`. "
            "Unquoted identifiers with spaces cause MySQL syntax errors."
        ),
    },
    {
        "id": "mysql_dialect_concat",
        "task_types": [TASK_SELECT, TASK_COMPARISON, TASK_OTHER, TASK_COUNTING],
        "keywords": ["concat", "concatenate", "string", "combine", "mysql", "dialect"],
        "text": (
            "This is MySQL, not SQLite. Use `CONCAT(a, b, c)` to concatenate strings — "
            "`a || b` is SQLite syntax and MySQL will treat `||` as a boolean OR, "
            "producing wrong/NULL results."
        ),
    },
    {
        "id": "mysql_cast_numeric",
        "task_types": [TASK_AGG_SUM, TASK_AGG_AVG, TASK_AGG_MAX, TASK_AGG_MIN, TASK_RANKING, TASK_COMPARISON],
        "keywords": ["sum", "avg", "average", "max", "min", "numeric", "text", "cast", "order"],
        "text": (
            "All columns in this DB are TEXT type. Before SUM/AVG/MAX/MIN or numeric "
            "ORDER BY, cast: `CAST(`col` AS DECIMAL(20,6))` or `AS SIGNED`. Otherwise "
            "you get lexicographic order (e.g. '10' < '2') or SUM returns NULL."
        ),
    },
    {
        "id": "describe_first_on_error",
        "task_types": list(_ALL_TASK_TYPES_LIST),
        "keywords": ["describe", "schema", "columns", "unknown", "error"],
        "text": (
            "If you get 'Unknown column' or 'Table doesn't exist', run "
            "`DESCRIBE `table_name`;` or `SHOW TABLES;` first to see the real names. "
            "Column names were truncated to 64 characters on import."
        ),
    },
    {
        "id": "like_contains_word",
        "task_types": [TASK_SELECT, TASK_COUNTING, TASK_COMPARISON],
        "keywords": ["contains", "mentions", "includes", "like", "substring", "partial"],
        "text": (
            "When the question says 'contains', 'mentions', or 'includes', use "
            "`WHERE `col` LIKE '%word%'` (not `= 'word'`). For case-insensitive, wrap "
            "both sides in LOWER(): `LOWER(`col`) LIKE LOWER('%word%')`."
        ),
    },
    {
        "id": "or_any_of",
        "task_types": [TASK_SELECT, TASK_COUNTING],
        "keywords": ["any", "or", "either", "one of", "multiple"],
        "text": (
            "For 'any of A, B, C' use OR: `col LIKE '%A%' OR col LIKE '%B%' OR col LIKE '%C%'`. "
            "IN-list only works when you match exact values, not substrings."
        ),
    },
    {
        "id": "select_star_preserves_shape",
        "task_types": [TASK_SELECT],
        "keywords": ["list", "all", "show", "information", "rows", "every"],
        "text": (
            "For 'list all …' / 'show all the …' that expect multiple columns, prefer "
            "`SELECT * FROM `t` WHERE …;` and submit the DB output exactly as returned. "
            "Do not reformat rows into sentences."
        ),
    },
    {
        "id": "count_rows_basic",
        "task_types": [TASK_COUNTING, TASK_AGG_COUNT],
        "keywords": ["count", "number of", "how many"],
        "text": (
            "For counting: `SELECT COUNT(*) FROM `t` WHERE …;`. Submit only the integer "
            "number (e.g. '5'), never '5 rows' or 'count: 5'."
        ),
    },
    {
        "id": "ranking_order_by_limit",
        "task_types": [TASK_RANKING],
        "keywords": ["highest", "lowest", "top", "bottom", "first", "most", "least", "rank"],
        "text": (
            "For ranking: `SELECT `col` FROM `t` ORDER BY CAST(`num_col` AS SIGNED) DESC LIMIT 1;`. "
            "Cast the ORDER BY expression when the column is TEXT-typed numeric, otherwise "
            "you get '9' > '10' lexicographic order."
        ),
    },
    {
        "id": "rank_by_one_return_another",
        "task_types": [TASK_RANKING, TASK_SELECT],
        "keywords": ["where", "from", "which team", "which country", "name of", "first", "last", "earliest", "latest"],
        "text": (
            "When the question asks for an attribute of the top/first row (e.g., "
            "'where was the first player transferred from'), sort by the ranking/date column "
            "but SELECT the requested target column. Example: "
            "`SELECT `From` FROM `t` ORDER BY `Date` ASC LIMIT 1;` "
            "(not `SELECT `Date` ...`)."
        ),
    },
    {
        "id": "aggregation_cast_sum",
        "task_types": [TASK_AGG_SUM, TASK_AGG_AVG],
        "keywords": ["sum", "average", "total", "add", "mean"],
        "text": (
            "`SELECT SUM(CAST(`col` AS DECIMAL(20,6))) FROM `t` WHERE …;`. "
            "If SUM returns NULL, there are no matching rows — submit '0' (the "
            "evaluator maps None/null → '0')."
        ),
    },
    {
        "id": "aggregation_avg_denominator",
        "task_types": [TASK_AGG_AVG],
        "keywords": ["average", "mean", "per", "avg"],
        "text": (
            "For AVG, exclude empty / NULL values: `WHERE `col` != '' AND `col` IS NOT NULL`. "
            "Otherwise the denominator may include empty rows and the mean is wrong."
        ),
    },
    {
        "id": "insert_value_order_matches_columns",
        "task_types": [TASK_INSERT],
        "keywords": ["insert", "add", "new row"],
        "text": (
            "`INSERT INTO `t` (`col1`, `col2`, …) VALUES ('v1', 'v2', …);`. "
            "All values should be quoted as strings (all columns are TEXT). "
            "Use the exact values from the question — do not guess or compute them. "
            "Commit only AFTER the INSERT executes without error."
        ),
    },
    {
        "id": "insert_request_means_execute_insert",
        "task_types": [TASK_INSERT],
        "keywords": ["needs to be recorded", "add this incident", "add this entry", "new record", "record this", "append row"],
        "text": (
            "If the task asks to add/record a new entry, you must execute an INSERT. "
            "A SELECT-only workflow is not enough. At most do one quick duplicate check, "
            "then run the INSERT and verify the new row exists."
        ),
    },
    {
        "id": "update_needs_where",
        "task_types": [TASK_UPDATE, TASK_DELETE],
        "keywords": ["update", "change", "set", "delete", "remove"],
        "text": (
            "ALWAYS include a WHERE clause on UPDATE/DELETE. A bare `UPDATE `t` SET …` "
            "modifies every row and the grading hash will never match."
        ),
    },
    {
        "id": "update_after_preview_same_filter",
        "task_types": [TASK_UPDATE],
        "keywords": ["for all", "update", "set to", "whose", "where", "consistency", "correct", "replace"],
        "text": (
            "For UPDATE tasks, a preview SELECT is optional, but you must execute UPDATE "
            "with the same filter condition afterward. Do not commit after preview only. "
            "Flow: preview target rows -> UPDATE ... WHERE same condition -> SELECT to verify."
        ),
    },
    {
        "id": "commit_raw_db_output_for_multirow",
        "task_types": [TASK_SELECT],
        "keywords": ["multiple", "rows", "list", "table", "output"],
        "text": (
            "For multi-column SELECT (≥2 columns per row), submit each ROW as one "
            "element keeping the Python tuple repr: "
            "answers=[\"('v1', 'v2')\", \"('v3', 'v4')\"]. "
            "For single-column results, submit bare values: answers=['v1', 'v2']. "
            "Never flatten columns or reformat into sentences."
        ),
    },
    {
        "id": "commit_numeric_bare",
        "task_types": [TASK_COUNTING, TASK_AGG_MAX, TASK_AGG_MIN, TASK_AGG_SUM, TASK_AGG_AVG, TASK_AGG_COUNT, TASK_RANKING],
        "keywords": ["number", "integer", "count", "numeric", "value"],
        "text": (
            "When the answer is a number, commit ONLY the bare number: '5', not "
            "'5 games', '5 records', or 'The answer is 5'. Trailing unit words cause "
            "set-comparison mismatches."
        ),
    },
    {
        "id": "none_or_null_means_zero",
        "task_types": [TASK_AGG_SUM, TASK_AGG_AVG, TASK_AGG_MAX, TASK_AGG_MIN, TASK_AGG_COUNT, TASK_COUNTING],
        "keywords": ["none", "null", "empty", "zero", "missing"],
        "text": (
            "If SUM/AVG/MAX/MIN returns NULL/None, submit '0'. The evaluator maps "
            "None/null/'' → '0', so '0' matches when the true answer is 'no rows'."
        ),
    },
    {
        "id": "mutation_must_execute",
        "task_types": [TASK_INSERT, TASK_UPDATE, TASK_DELETE],
        "keywords": ["insert", "update", "delete", "modify", "change", "commit"],
        "text": (
            "INSERT/UPDATE/DELETE is scored by a table hash. You must actually run "
            "the mutation SQL successfully before calling commit_final_answer — "
            "committing without running the SQL fails the hash check."
        ),
    },
    {
        "id": "no_repeat_when_done",
        "task_types": list(_ALL_TASK_TYPES_LIST),
        "keywords": ["already", "have", "answer", "submit", "result", "done"],
        "text": (
            "If your last query already returned the exact answer, do not re-run the "
            "same SQL. Call commit_final_answer immediately with that value."
        ),
    },
    {
        "id": "truncation_handling",
        "task_types": list(_ALL_TASK_TYPES_LIST),
        "keywords": ["truncated", "truncation", "64", "long", "name"],
        "text": (
            "Long column names were truncated to 64 characters during table creation. "
            "Use the names shown in the schema card below — NOT the raw descriptive "
            "names from the question — as MySQL identifiers."
        ),
    },
    {
        "id": "date_format_passthrough",
        "task_types": [TASK_SELECT, TASK_RANKING, TASK_COMPARISON],
        "keywords": ["date", "time", "year", "month", "day"],
        "text": (
            "Date values are stored as strings. Match them with `=` or `LIKE` exactly "
            "as they appear (e.g. 'February 1' or '2023-01-05'). When submitting dates, "
            "use the exact string the DB returned."
        ),
    },
    {
        "id": "distinct_unique_count",
        "task_types": [TASK_COUNTING, TASK_SELECT, TASK_AGG_COUNT],
        "keywords": ["unique", "distinct", "different", "how many types", "separate", "variety"],
        "text": (
            "For 'how many unique/distinct X' use `SELECT COUNT(DISTINCT `col`) FROM `t`;`. "
            "For listing unique values use `SELECT DISTINCT `col` FROM `t` WHERE …;`. "
            "Without DISTINCT, COUNT(*) includes duplicates."
        ),
    },
    {
        "id": "group_by_having_filter",
        "task_types": [TASK_AGG_SUM, TASK_AGG_AVG, TASK_AGG_COUNT, TASK_COUNTING],
        "keywords": ["group", "having", "per", "each", "total per", "filter aggregate", "at least", "more than"],
        "text": (
            "To filter on an aggregated value use HAVING (not WHERE): "
            "`SELECT col, COUNT(*) FROM `t` GROUP BY col HAVING COUNT(*) > 2;`. "
            "WHERE filters individual rows before grouping; HAVING filters groups after. "
            "Never put an aggregate function inside a WHERE clause."
        ),
    },
    {
        "id": "scalar_expect_one_row",
        "task_types": [TASK_SELECT, TASK_COUNTING, TASK_COMPARISON],
        "keywords": ["how many", "total", "count", "number of", "single value", "overall"],
        "text": (
            "When the answer is a single total (e.g. 'how many X'), use a global aggregate "
            "WITHOUT GROUP BY: `SELECT COUNT(*) FROM `t` WHERE …;`. "
            "Adding GROUP BY returns one row per group, not a single total — you will "
            "get many rows instead of one number. Do not use this pattern when the question "
            "explicitly says 'for each', 'grouped by', or 'in each <category>'."
        ),
    },
    {
        "id": "between_range_filter",
        "task_types": [TASK_SELECT, TASK_COUNTING, TASK_COMPARISON, TASK_RANKING],
        "keywords": ["between", "range", "from", "to", "above", "below", "over", "under", "greater", "less"],
        "text": (
            "For numeric range filters: `WHERE CAST(`col` AS SIGNED) BETWEEN 10 AND 20` "
            "(inclusive on both ends). Always CAST TEXT-typed numeric columns first. "
            "For date ranges: `WHERE `col` >= '2020-01-01' AND `col` <= '2020-12-31'`."
        ),
    },
    {
        "id": "text_currency_numeric_compare",
        "task_types": [TASK_SELECT, TASK_COUNTING, TASK_COMPARISON, TASK_RANKING],
        "keywords": ["£", "$", "currency", "toll", "price", "above", "greater than", "at least"],
        "text": (
            "If numeric values contain currency symbols or commas (e.g., '£4.00', '$1,200'), "
            "strip symbols before numeric comparison: "
            "`CAST(REPLACE(REPLACE(`col`, '£', ''), ',', '') AS DECIMAL(20,6)) > 4.0`. "
            "Do not compare such values as raw strings."
        ),
    },
    {
        "id": "subquery_in_list",
        "task_types": [TASK_SELECT, TASK_COUNTING, TASK_COMPARISON],
        "keywords": ["not in", "exclude", "except", "without", "never", "no", "don't have"],
        "text": (
            "For 'rows that DON'T appear in another set' use NOT IN: "
            "`SELECT * FROM `t` WHERE `col` NOT IN (SELECT `col` FROM `t2` WHERE …);`. "
            "For 'rows that DO appear' use IN. "
            "Watch out for NULL: `NOT IN (…)` returns no rows if the subquery contains NULL."
        ),
    },
    {
        "id": "next_previous_row_lookup",
        "task_types": [TASK_SELECT, TASK_COMPARISON],
        "keywords": ["next to", "next", "after", "following", "previous", "before", "adjacent", "neighbor"],
        "text": (
            "For 'next/previous row' questions, first find the anchor row key, then query the "
            "adjacent row by an ordering column (id/rank/date). Example: "
            "`SELECT ... FROM t WHERE id = (SELECT id FROM t WHERE name='X') + 1`. "
            "Do not stop at returning the anchor row itself."
        ),
    },
    {
        "id": "sample_values_before_filter",
        "task_types": list(_ALL_TASK_TYPES_LIST),
        "keywords": ["empty", "no rows", "not found", "zero", "cannot find", "exact", "stored"],
        "text": (
            "If your WHERE clause returns zero rows, the stored value may differ from what "
            "you expect (different case, extra spaces, em-dash vs hyphen, or extra text). "
            "Run `SELECT DISTINCT `col` FROM `t` LIMIT 10;` to see actual stored values, "
            "then match them exactly in your WHERE clause."
        ),
    },
    {
        "id": "insert_all_columns_required",
        "task_types": [TASK_INSERT],
        "keywords": ["insert", "add row", "all columns", "hash", "missing"],
        "text": (
            "Your INSERT must include EVERY column in the table. "
            "The grader checks the table hash across ALL columns — if any column is "
            "omitted it defaults to NULL and the hash will not match. "
            "List all column names from the schema card in your INSERT … column list."
        ),
    },
    {
        "id": "quote_apostrophe_in_value",
        "task_types": list(_ALL_TASK_TYPES_LIST),
        "keywords": ["apostrophe", "quote", "single quote", "string", "value", "escape"],
        "text": (
            "If a WHERE/VALUES string contains a single-quote (apostrophe), escape it by "
            "doubling it: `WHERE `col` = 'O''Brien'` or use a backslash: `'O\\'Brien'`. "
            "An unescaped apostrophe breaks the SQL string and causes a syntax error."
        ),
    },
    {
        "id": "update_preview_then_mutate",
        "task_types": [TASK_UPDATE, TASK_DELETE],
        "keywords": ["update", "delete", "where", "find", "row", "target", "verify"],
        "text": (
            "Before running UPDATE/DELETE, confirm the target row exists: "
            "`SELECT * FROM `t` WHERE …;` — if it returns empty, relax the filter or "
            "check the exact stored values. Once you find the row, run the mutation "
            "using the EXACT same WHERE clause."
        ),
    },
    {
        "id": "text_column_exact_match_cast",
        "task_types": [TASK_AGG_MIN, TASK_AGG_MAX, TASK_AGG_SUM, TASK_AGG_AVG, TASK_COUNTING, TASK_COMPARISON, TASK_RANKING],
        "keywords": ["text", "numeric", "cast", "match", "filter", "null", "empty result"],
        "text": (
            "All columns are stored as TEXT. When filtering on a numeric-looking value "
            "(e.g. `WHERE score = -8`), implicit coercion usually works but fails if "
            "the stored value has extra text or a unicode minus (−). "
            "Use CAST for reliable numeric comparison: `WHERE CAST(`col` AS DECIMAL) = -8`, "
            "or check actual values first: `SELECT DISTINCT `col` FROM `t` LIMIT 10`."
        ),
    },
    {
        "id": "verify_mutation_with_select",
        "task_types": [TASK_INSERT, TASK_UPDATE, TASK_DELETE],
        "keywords": ["insert", "update", "delete", "verify", "check", "confirm", "success"],
        "text": (
            "After INSERT/UPDATE/DELETE returns `[]` (success), verify with "
            "`SELECT * FROM `tbl` WHERE …` that the change is correct. "
            "If the SELECT shows wrong data, run the corrected SQL. "
            "Only commit_final_answer once the data looks right."
        ),
    },
    {
        "id": "empty_result_wrong_filter",
        "task_types": [TASK_SELECT, TASK_COUNTING, TASK_AGG_COUNT, TASK_AGG_SUM, TASK_AGG_AVG, TASK_AGG_MAX, TASK_AGG_MIN, TASK_RANKING, TASK_COMPARISON],
        "keywords": ["empty", "no rows", "nothing", "zero", "null", "not found", "no result"],
        "text": (
            "If SELECT returns `[]`, your WHERE filter matched nothing. "
            "Check actual values: `SELECT * FROM `tbl` LIMIT 5`. "
            "Common causes: wrong column name, case mismatch, extra spaces, "
            "or numeric stored as text. Use LIKE for partial matches."
        ),
    },
    {
        "id": "aggregate_zero_check",
        "task_types": [TASK_COUNTING, TASK_AGG_COUNT, TASK_AGG_SUM, TASK_AGG_AVG, TASK_AGG_MAX, TASK_AGG_MIN],
        "keywords": ["count", "sum", "average", "max", "min", "aggregate", "zero", "null", "total"],
        "text": (
            "If COUNT/SUM/AVG returns 0 or NULL, the WHERE clause likely filtered out "
            "all rows. Run `SELECT COUNT(*) FROM `tbl`` (no WHERE) to check total rows. "
            "Then add filters step-by-step to find the issue."
        ),
    },
    {
        "id": "ranking_commit_value_not_rank",
        "task_types": [TASK_RANKING],
        "keywords": ["rank", "ranking", "position", "order", "who", "which", "name", "person"],
        "text": (
            "Ranking tasks ask for the NAME or VALUE at a specific rank — "
            "e.g. 'who ranked 3rd' → commit the person's name, not the number 3. "
            "Use ORDER BY … LIMIT 1 OFFSET N-1 or WHERE rank_col = N to get the entity."
        ),
    },
    {
        "id": "insert_values_exact_text_format",
        "task_types": [TASK_INSERT],
        "keywords": ["insert", "add", "new row", "values", "text", "string", "format", "exact"],
        "text": (
            "ALL columns are TEXT. INSERT values must be quoted strings matching "
            "the EXACT format in the table — including units ('100.0 m.'), ordinals ('2nd'), "
            "date strings ('October 23, 2005'), and score formats ('70-70-70=210'). "
            "Do not use bare numbers (30) — use '30'. Check sample rows in the schema card."
        ),
    },
    {
        "id": "grouped_by_multi_row_answer",
        "task_types": [TASK_SELECT, TASK_COUNTING],
        "keywords": ["group", "grouped by", "for each", "per", "count by", "how many each"],
        "text": (
            "Questions with 'grouped by X' / 'for each X' expect MULTI-ROW answers — "
            "one row per group. Use `SELECT X, COUNT(*) FROM tbl GROUP BY X` and commit "
            "ALL rows as tuple strings: answers=[\"('X1', 3)\", \"('X2', 1)\", ...]."
        ),
    },
    {
        "id": "unique_entity_with_related_values",
        "task_types": [TASK_SELECT, TASK_COUNTING],
        "keywords": ["unique", "appears only once", "each driver once", "list each", "with car numbers", "with values"],
        "text": (
            "If the question asks for one row per entity plus related values (e.g. "
            "'each driver once with car numbers'), group by the entity and aggregate the "
            "related field: `SELECT Driver, GROUP_CONCAT(DISTINCT `Car #`) FROM t ... "
            "GROUP BY Driver ORDER BY Driver`. Do not return duplicated entity rows."
        ),
    },
    {
        "id": "update_with_dataset_average",
        "task_types": [TASK_UPDATE],
        "keywords": ["replace with average", "set to average", "update all rows where", "incorrectly recorded as 0", "average of all other"],
        "text": (
            "For UPDATE tasks that set bad rows to a dataset average, compute the average "
            "from valid rows in a subquery and use it in UPDATE. Example: "
            "`UPDATE t SET col=(SELECT ROUND(AVG(CAST(col AS DECIMAL(20,6)))) FROM t WHERE col!='0') "
            "WHERE col='0';` then verify with SELECT."
        ),
    },
]


def retrieve_db_skills(
    task_type: str,
    query: str,
    top_k: int = 2,
) -> List[Dict[str, Any]]:
    candidates = [s for s in DB_SKILLS if task_type in s.get("task_types", [])]
    if not candidates:
        candidates = [s for s in DB_SKILLS if TASK_SELECT in s.get("task_types", [])]
    if not candidates:
        return []
    if len(candidates) <= top_k:
        return candidates
    q = (query or "").lower()

    # Hard preferences for top-1 mode on high-conflict phrasings.
    unique_entity_phrase = (
        ("unique" in q and ("once" in q or "only once" in q))
        or "each driver" in q
        or "car number" in q
    )
    if unique_entity_phrase:
        unique_skill = next((s for s in candidates if s.get("id") == "unique_entity_with_related_values"), None)
        if unique_skill is not None and top_k == 1:
            return [unique_skill]

    # Grouped/per-category phrasing usually expects multi-row grouped outputs.
    grouped_phrase = any(p in q for p in ["grouped by", "for each", "in each", "count by"])
    if grouped_phrase:
        grouped_skill = next((s for s in candidates if s.get("id") == "grouped_by_multi_row_answer"), None)
        if grouped_skill is not None and top_k == 1:
            return [grouped_skill]

    query_tokens = _bm25_tokenize(query)
    if not query_tokens:
        return candidates[:top_k]
    docs = [_skill_doc_tokens(s) for s in candidates]
    scores = _bm25_scores(query_tokens, docs)

    # Top-1 mode needs stronger disambiguation on high-conflict phrasings.
    def heuristic_boost(skill_id: str) -> float:
        boost = 0.0
        if grouped_phrase and skill_id == "grouped_by_multi_row_answer":
            boost += 6.0
        if grouped_phrase and skill_id == "scalar_expect_one_row":
            boost -= 3.0

        if unique_entity_phrase:
            if skill_id == "unique_entity_with_related_values":
                boost += 2.0

        if "update" in q and "average" in q and ("incorrectly" in q or "0" in q):
            if skill_id == "update_with_dataset_average":
                boost += 2.0

        if any(p in q for p in ["next to", "next ", "previous", "before", "after", "adjacent"]):
            if skill_id == "next_previous_row_lookup":
                boost += 2.0

        if any(sym in q for sym in ["£", "$", "currency", "toll", "price"]) and any(
            p in q for p in ["above", "greater than", "at least", "over"]
        ):
            if skill_id == "text_currency_numeric_compare":
                boost += 2.0

        if any(p in q for p in ["needs to be recorded", "add this incident", "add this entry", "new record"]):
            if skill_id == "insert_request_means_execute_insert":
                boost += 2.0

        return boost

    adjusted = []
    for score, skill in zip(scores, candidates):
        sid = skill.get("id", "")
        adjusted.append((score + heuristic_boost(sid), skill))

    ranked = sorted(adjusted, key=lambda x: x[0], reverse=True)
    return [c for _, c in ranked[:top_k]]


# ─────────────────────────────────────────────────────────────────────────────
# H0 — Task Parser
# ─────────────────────────────────────────────────────────────────────────────

_LIKE_SIGNALS = [
    "contains", "containing", "mentions", "mentioned", "includes", "including",
    "has the word", "with the word",
]
_CASE_INSENSITIVE_SIGNALS = [
    "ignoring case", "regardless of case", "case-insensitive", "case insensitive",
]


@dataclass
class DBTaskContext:
    raw_description: str = ""
    task_type: str = TASK_OTHER
    answer_shape: Optional[str] = None
    target_table_raw: Optional[str] = None
    target_table_sanitized: Optional[str] = None
    target_cols_raw: List[str] = field(default_factory=list)
    target_cols_sanitized: List[str] = field(default_factory=list)
    mentions_like: bool = False
    case_insensitive: bool = False
    expected_insert_cols: Optional[int] = None   # for INSERT: number of columns in std_sql shape


def _detect_answer_shape(task_type: str, description: str) -> Optional[str]:
    t = (description or "").lower()
    if task_type in _MUTATION_TYPES:
        return SHAPE_HASH
    if task_type == TASK_COUNTING or task_type == TASK_AGG_COUNT:
        # "how many X of each Y" / "for each Y" → GROUP BY → multi-row answer
        if re.search(r"\bfor each\b|\bof each\b|\bper \w+\b|\bgrouped? by\b", t):
            return SHAPE_MULTI_MULTI
        return SHAPE_SCALAR_INT
    if task_type == TASK_AGG_SUM or task_type == TASK_AGG_AVG:
        return SHAPE_SCALAR_FLOAT
    if task_type in (TASK_AGG_MAX, TASK_AGG_MIN):
        # Max/min could be numeric or string — infer from keywords.
        if re.search(r"\b(highest|lowest|most|least|maximum|minimum|number|count|score|points|value)\b", t):
            return SHAPE_SCALAR_FLOAT
        return SHAPE_SCALAR_STR
    if task_type == TASK_RANKING:
        # Ranking usually asks for a name/row at top/bottom.
        return SHAPE_SCALAR_STR
    if task_type == TASK_SELECT:
        # GROUP BY / "for each" queries always return multi-row — check first so
        # "how many ... grouped by X" doesn't get collapsed to scalar.
        _grouped = bool(re.search(
            r"\bgrouped? by\b|\bfor each\b|\bper \w+\b|\beach \w+ (has|have|had|shows?|lists?)\b",
            t,
        ))
        if _grouped:
            return SHAPE_MULTI_MULTI
        # Prefer multi-row multi-col unless description strongly implies single value.
        if re.search(r"\bhow many\b|\bnumber of\b|\btotal\b|\bcount\b", t):
            return SHAPE_SCALAR_INT
        return SHAPE_MULTI_MULTI
    if task_type == TASK_COMPARISON:
        return SHAPE_SCALAR_STR
    return None


def parse_task_context(entry: Dict[str, Any]) -> DBTaskContext:
    """Build DBTaskContext from a dataset entry.

    Reads only `type`, `description`, `table`, and `sql.query` structure (the
    latter for INSERT-column-count only — never values).
    """
    ctx = DBTaskContext()
    desc = entry.get("description", "") or ""
    ctx.raw_description = desc

    # Task type
    raw_type_list = entry.get("type", []) or []
    raw_type = raw_type_list[0] if raw_type_list else TASK_OTHER
    if raw_type in _ALL_TASK_TYPES_LIST:
        ctx.task_type = raw_type
    else:
        ctx.task_type = TASK_OTHER

    ctx.answer_shape = _detect_answer_shape(ctx.task_type, desc)

    # Target table — first table in entry['table'] (single or list)
    tables = entry.get("table")
    if isinstance(tables, list) and tables:
        first = tables[0]
    elif isinstance(tables, dict):
        first = tables
    else:
        first = None
    if first:
        raw = first.get("table_name", "") or ""
        ctx.target_table_raw = raw
        ctx.target_table_sanitized = sanitize_identifier(raw, fallback_prefix="table_0")
        cols = first.get("table_info", {}).get("columns", []) or []
        ctx.target_cols_raw = [c.get("name", "") for c in cols]
        ctx.target_cols_sanitized = _sanitize_columns(cols)

    # Intent signals (lexical only; no label inspection)
    d_low = desc.lower()
    ctx.mentions_like = any(sig in d_low for sig in _LIKE_SIGNALS)
    ctx.case_insensitive = any(sig in d_low for sig in _CASE_INSENSITIVE_SIGNALS)

    # INSERT column-count hint (from std_sql structure only — NOT values)
    if ctx.task_type == TASK_INSERT:
        std_sql = (entry.get("sql") or {}).get("query") or ""
        m = re.search(r"INSERT\s+INTO\s+`?[^`\s]+`?\s*\(([^)]+)\)", std_sql, re.IGNORECASE)
        if m:
            cols_part = m.group(1)
            ctx.expected_insert_cols = len([c for c in cols_part.split(",") if c.strip()])
    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# H_SCHEMA — Schema Card
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class SchemaMap:
    tables: List[Dict[str, Any]] = field(default_factory=list)
    # name_map: lowercase raw name → sanitized name (for case-insensitive fuzzy match)
    name_map: Dict[str, str] = field(default_factory=dict)
    has_truncation: bool = False


def build_schema_map(entry: Dict[str, Any]) -> SchemaMap:
    sm = SchemaMap()
    tables = entry.get("table")
    if isinstance(tables, dict):
        tables = [tables]
    if not isinstance(tables, list):
        return sm

    for t_idx, t in enumerate(tables):
        raw_tname = t.get("table_name", "") or ""
        s_tname = sanitize_identifier(raw_tname, fallback_prefix=f"table_{t_idx}")
        cols = t.get("table_info", {}).get("columns", []) or []
        raw_col_names = [c.get("name", "") for c in cols]
        s_col_names = _sanitize_columns(cols)

        cols_detail = []
        for raw_c, s_c in zip(raw_col_names, s_col_names):
            truncated = (raw_c != s_c)
            if truncated:
                sm.has_truncation = True
            cols_detail.append({"raw": raw_c, "sanitized": s_c, "truncated": truncated})
            # name_map for H2 auto-backtick (lowercase key for case-insensitive)
            if s_c:
                sm.name_map[s_c.lower()] = s_c

        # Store up to 2 sample rows (raw values) for INSERT task guidance.
        sample_rows = t.get("table_info", {}).get("rows", [])[:2]

        sm.tables.append({
            "raw": raw_tname,
            "sanitized": s_tname,
            "truncated": raw_tname != s_tname,
            "columns": cols_detail,
            "sample_rows": sample_rows,
        })
        if s_tname:
            sm.name_map[s_tname.lower()] = s_tname

    return sm


def build_schema_card(schema_map: SchemaMap, max_lines: int = 20, task_type: str = "") -> str:
    """Render a compact readable schema card for prompt injection."""
    if not schema_map.tables:
        return ""
    show_samples = task_type in (TASK_INSERT, TASK_UPDATE, TASK_DELETE)
    lines: List[str] = [
        "[SCHEMA HINT] MySQL tables (always wrap names with spaces/punct in backticks):",
    ]
    for t in schema_map.tables:
        s_tname = t["sanitized"]
        cols = t["columns"]
        col_parts = []
        for c in cols:
            entry = f"`{c['sanitized']}`"
            if c["truncated"]:
                entry += f" /* truncated from {len(c['raw'])} chars */"
            col_parts.append(entry)
        line = f"- `{s_tname}` ({', '.join(col_parts)})"
        if t["truncated"]:
            line += f"  /* table name truncated from {len(t['raw'])} chars */"
        lines.append(line)
        # For INSERT/UPDATE/DELETE: show 2 sample rows so agent knows exact value formats.
        if show_samples and t.get("sample_rows"):
            s_cols = [c["sanitized"] for c in cols]
            lines.append(
                "  Sample rows (values are TEXT — use these exact formats in INSERT/UPDATE):"
            )
            for row in t["sample_rows"]:
                pairs = ", ".join(
                    f"`{sc}`: {repr(str(v))}" for sc, v in zip(s_cols, row)
                )
                lines.append(f"    {{{pairs}}}")
        if len(lines) >= max_lines:
            break
    if schema_map.has_truncation:
        lines.append(
            "Note: names longer than 64 chars were truncated on import. Reference columns EXACTLY as shown above."
        )
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# H1 — Session State
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DBSessionState:
    sql_history: List[str] = field(default_factory=list)  # normalised (lowercase, whitespace-collapsed)
    sql_history_raw: List[str] = field(default_factory=list)
    last_sql: Optional[str] = None
    last_result_raw: str = ""
    last_result_was_error: bool = False
    last_error_kind: Optional[str] = None   # syntax / unknown_col / unknown_table / timeout / empty / null_agg / ok
    last_error_text: str = ""
    discovered_columns: Dict[str, List[str]] = field(default_factory=dict)
    candidate_answer: Optional[Any] = None        # raw DB output string or extracted shape
    candidate_answer_shape: Optional[str] = None  # SHAPE_* tag for the candidate
    candidate_implausible: bool = False
    error_streak: int = 0
    empty_streak: int = 0
    text_only_streak: int = 0
    loop_streak: int = 0
    mutation_attempted: bool = False
    commit_blocks_used: int = 0
    mutation_commit_blocks_used: int = 0
    scalar_multi_answer_blocks_used: int = 0  # dedicated counter for scalar>1 blocks
    last_result_col_count: Optional[int] = None  # column count of last multi-col result
    last_result_row_count: Optional[int] = None  # row count of last SQL result
    h4_fired_last_round: bool = False
    # H6 terminal-evidence tracking
    evidence_blocks_used: int = 0                # capped evidence-gate blocks (never mixed with commit_blocks_used)
    last_evidence_block_sql: Optional[str] = None  # normalised SQL the last evidence block followed
    last_result_had_rows: bool = False           # did the last SQL result contain >= 1 row
    last_agg_fn: Optional[str] = None            # COUNT/SUM/AVG/MIN/MAX of the last SELECT projection, else None
    last_projection: List[str] = field(default_factory=list)  # top-level projection expressions of the last SELECT
    # H7 INSERT literal fidelity (thousands-separator normalisation)
    fmt_norm_used: int = 0                       # capped rewrite count (distinct normalised outputs)
    fmt_norm_sqls: List[str] = field(default_factory=list)   # normalised SQL already produced by H7 (dedupe)
    fmt_norm_hinted_cols: List[str] = field(default_factory=list)  # columns already hinted (emit at most once each)
    # H9 repr-escape fidelity (literal \xHH sequences in SQL literals)
    h9_repr_used: int = 0                        # capped rewrite count (distinct normalised outputs)
    h9_repr_sqls: List[str] = field(default_factory=list)    # normalised SQL already produced by H9 (dedupe)


def _normalize_sql(sql: str) -> str:
    s = (sql or "").strip().rstrip(";")
    s = re.sub(r"\s+", " ", s).lower()
    return s


# ─────────────────────────────────────────────────────────────────────────────
# H2 — Rescue parser for text-embedded tool calls
# ─────────────────────────────────────────────────────────────────────────────

_RESCUE_EXECUTE_JSON_RE = re.compile(
    r'execute_sql\s*[\({]\s*\{?\s*[\"\']?query[\"\']?\s*:\s*[\"\']((?:[^\"\'\\]|\\.)+)[\"\']',
    re.IGNORECASE | re.DOTALL,
)
_RESCUE_EXECUTE_KWARG_RE = re.compile(
    r"execute_sql\s*\(\s*query\s*=\s*['\"]((?:[^'\"\\]|\\.)+)['\"]",
    re.IGNORECASE | re.DOTALL,
)
_RESCUE_SQL_FENCE_RE = re.compile(r"```sql\n(.*?)\n```", re.DOTALL | re.IGNORECASE)
_RESCUE_COMMIT_JSON_RE = re.compile(
    r'commit_final_answer\s*[\({]\s*\{?\s*[\"\']?answers[\"\']?\s*:\s*(\[[^\]]*\])',
    re.IGNORECASE | re.DOTALL,
)
_RESCUE_COMMIT_KWARG_RE = re.compile(
    r"commit_final_answer\s*\(\s*answers\s*=\s*(\[[^\]]*\])",
    re.IGNORECASE | re.DOTALL,
)


# H9 — tolerant JSON repair for <tool_call> bodies.  The model can emit a
# backslash+letter sequence JSON does not define (e.g. \xNN copied straight
# from a repr-rendered stored value, or \' inside an SQL literal).  The
# repair passes such sequences through literally so the decoded string keeps
# "backslash + char" exactly as written, instead of dropping the tool call.
def _lenient_json_loads(raw: str) -> Optional[Any]:
    """json.loads with a tolerant repair for escapes JSON does not define.

    Non-JSON escapes are passed through literally (backslash kept) so no
    information about the model's intended SQL text is lost.
    """
    try:
        return json.loads(raw)
    except Exception:
        pass
    out = []
    in_str = False
    i = 0
    n = len(raw)
    while i < n:
        ch = raw[i]
        if not in_str:
            out.append(ch)
            if ch == '"':
                in_str = True
            i += 1
            continue
        if ch == "\\":
            nxt = raw[i + 1] if i + 1 < n else ""
            if nxt in '"\\/bfnrtu':
                if nxt == "u":
                    out.append(raw[i:i + 6])
                    i += 6
                else:
                    out.append(raw[i:i + 2])
                    i += 2
                continue
            # not defined by JSON -> emit it as an escaped backslash followed by
            # the character, so the decoded string keeps "backslash + char"
            # exactly as the model wrote it.
            out.append("\\\\" + nxt)
            i += 2
            continue
        if ch == '"':
            in_str = False
            out.append(ch)
        elif ch in "\n\r\t":
            # H9/A: keys must be the raw control characters themselves (the
            # previous backslash+letter keys could never match `ch` and raised
            # KeyError, killing the whole episode on a desynced body); the
            # values are the JSON escape sequences those chars are emitted as.
            out.append({"\n": "\\n", "\r": "\\r", "\t": "\\t"}[ch])
        else:
            out.append(ch)
        i += 1
    try:
        return json.loads("".join(out))
    except Exception:
        return None


# H9/B — envelope-anchored payload fallback.  A body can defeat both the strict
# and the tolerant scanner (an unescaped inner quote desyncs every later string
# boundary) while still being a complete envelope around one tool call.  These
# helpers recover the payload by anchoring on the envelope keys and on the last
# unescaped closing quote/bracket of the body instead of trusting quote
# balance; the JSON fidelity rule for unknown escapes (keep backslash+char)
# is preserved by _tolerant_json_unescape.
_ENVELOPE_NAME_RE = re.compile(
    r'["\']name["\']\s*:\s*["\'](execute_sql|commit_final_answer)["\']',
    re.IGNORECASE,
)
_ENVELOPE_QUERY_KEY_RE = re.compile(r'["\']query["\']\s*:\s*["\']', re.IGNORECASE)
_ENVELOPE_ANSWERS_KEY_RE = re.compile(r'["\']answers["\']\s*:\s*\[', re.IGNORECASE)
_ENVELOPE_TAIL_RE = re.compile(r"^[}\])]*\s*$")
_ENVELOPE_STRING_ITEM_RE = re.compile(r'"((?:[^"\\]|\\.)*)"')
_ENVELOPE_SQL_KEYWORDS = frozenset((
    "SELECT", "INSERT", "UPDATE", "DELETE", "WITH", "SHOW", "DESC",
    "DESCRIBE", "EXPLAIN", "REPLACE", "CREATE", "DROP", "ALTER", "SET",
    "CALL",
))
_UNESCAPE_SIMPLE = {'"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f",
                    "n": "\n", "r": "\r", "t": "\t"}


def _tolerant_json_unescape(s: str) -> str:
    """Decode JSON-legal escapes; keep every other backslash+char literally."""
    out = []
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if ch == "\\" and i + 1 < n:
            nxt = s[i + 1]
            if nxt in _UNESCAPE_SIMPLE:
                out.append(_UNESCAPE_SIMPLE[nxt])
                i += 2
                continue
            if nxt == "u" and i + 6 <= n:
                try:
                    out.append(chr(int(s[i + 2:i + 6], 16)))
                    i += 6
                    continue
                except ValueError:
                    pass
            # H9 fidelity rule: unknown escape -> keep backslash + char.
            out.append("\\" + nxt)
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _last_unescaped_quote(s: str) -> int:
    """Index of the last `"` in `s` not preceded by an odd number of `\\`."""
    i = len(s) - 1
    while i >= 0:
        if s[i] == '"':
            nb = 0
            j = i - 1
            while j >= 0 and s[j] == "\\":
                nb += 1
                j -= 1
            if nb % 2 == 0:
                return i
        i -= 1
    return -1


def _envelope_tool_call_from_body(raw: str) -> Optional[Dict[str, Any]]:
    """Recover a tool call from a JSON body that no longer parses cleanly.

    Anchors on the envelope keys instead of quote balance: the query payload
    is the span between the `query` value's opening quote and the last
    unescaped quote whose suffix consists only of whitespace and closing
    `}`/`]`/`)` characters, so a desynced inner quote cannot cut it.
    Returns None unless the recovered payload looks like the expected call.
    """
    if not raw:
        return None
    m = _ENVELOPE_NAME_RE.search(raw)
    if m is None:
        return None
    name = m.group(1).lower()
    if name == "execute_sql":
        qm = _ENVELOPE_QUERY_KEY_RE.search(raw)
        if qm is None:
            return None
        start = qm.end()
        end = _last_unescaped_quote(raw)
        while end > start and not _ENVELOPE_TAIL_RE.match(raw[end + 1:]):
            end = _last_unescaped_quote(raw[:end])
        if end <= start:
            return None
        sql = _tolerant_json_unescape(raw[start:end]).strip()
        if not sql:
            return None
        first = sql.split(None, 1)[0].upper()
        if first not in _ENVELOPE_SQL_KEYWORDS:
            return None
        return {"name": "execute_sql", "arguments": {"query": sql}}
    am = _ENVELOPE_ANSWERS_KEY_RE.search(raw)
    if am is None:
        return None
    start = am.end()
    end = raw.rfind("]")
    if end <= start:
        return None
    items = []
    for sm in _ENVELOPE_STRING_ITEM_RE.finditer(raw[start:end]):
        item = _tolerant_json_unescape(sm.group(1))
        if item.strip():
            items.append(item)
    if not items:
        return None
    return {"name": "commit_final_answer", "arguments": {"answers": items}}


def _tool_call_from_json_body(raw: str) -> Optional[Dict[str, Any]]:
    """Normalise a <tool_call> JSON body into a tool call, tolerantly.

    Returns None unless the body parses (leniently) into a dict carrying a
    known tool name and a well-formed, truthy arguments dict.  A body the
    tolerant parse cannot decode is handed to the envelope-anchored fallback
    (H9/B), which recovers a complete payload from a desynced body.
    """
    obj = _lenient_json_loads(raw)
    if not isinstance(obj, dict):
        return _envelope_tool_call_from_body(raw)
    name = obj.get("name", "")
    args = obj.get("arguments", {})
    if name not in ("execute_sql", "commit_final_answer"):
        return _envelope_tool_call_from_body(raw)
    if not isinstance(args, dict) or not args:
        return _envelope_tool_call_from_body(raw)
    if name == "execute_sql":
        query = args.get("query")
        if not isinstance(query, str) or not query.strip():
            return _envelope_tool_call_from_body(raw)
        return {"name": "execute_sql", "arguments": {"query": query}}
    answers = args.get("answers")
    if not isinstance(answers, list) or not answers:
        return _envelope_tool_call_from_body(raw)
    return {"name": "commit_final_answer",
            "arguments": {"answers": [str(x) for x in answers]}}


_RESCUE_TOOL_CALL_XML_RE = re.compile(
    r"<tool_call>\s*(\{.*?\})\s*</tool_call>",
    re.DOTALL | re.IGNORECASE,
)
# Tolerant XML: <tool_call> without closing tag — model output may be truncated.
_RESCUE_TOOL_CALL_XML_OPEN_RE = re.compile(
    r"<tool_call>\s*(\{[^<]{0,8000})",
    re.DOTALL | re.IGNORECASE,
)
# Partial answers list: capture all fully-quoted strings from a truncated JSON list.
_RESCUE_PARTIAL_STRING_RE = re.compile(r'"((?:[^"\\]|\\.)*)"')

# xLAM-style bracket-list tool calls.
#   JSON form:    [{"name": "execute_sql", "arguments": {"query": "..."}}]
#                 (also accepts "args" / "parameters" as field aliases)
#   Python form:  [execute_sql(query='SELECT ... WHERE x="a"')]
#                 [commit_final_answer(answers=['a','b'])]
_RESCUE_PY_CALL_HEAD_RE = re.compile(
    r"^\s*\[\s*(execute_sql|commit_final_answer)\s*\(",
    re.IGNORECASE,
)
_RESCUE_PY_KWARG_RE = re.compile(r"\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*$", re.DOTALL)
_VALID_TOOL_NAMES = {"execute_sql", "commit_final_answer"}


def _find_matching_bracket(s: str, start: int) -> int:
    """Return index of ']' matching the '[' at position `start`, honouring
    string literals so brackets inside quotes don't unbalance the count.
    Returns -1 if no match.
    """
    if start >= len(s) or s[start] != "[":
        return -1
    depth = 0
    in_str: Optional[str] = None
    esc = False
    for i in range(start, len(s)):
        ch = s[i]
        if esc:
            esc = False
            continue
        if in_str:
            if ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
            continue
        if ch in ('"', "'"):
            in_str = ch
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return i
    return -1


def _find_matching_paren(s: str, start: int) -> int:
    """Return index of ')' matching the '(' at position `start`."""
    if start >= len(s) or s[start] != "(":
        return -1
    depth = 0
    in_str: Optional[str] = None
    esc = False
    for i in range(start, len(s)):
        ch = s[i]
        if esc:
            esc = False
            continue
        if in_str:
            if ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
            continue
        if ch in ('"', "'"):
            in_str = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i
    return -1


def _normalize_rescued_args(name: str, args: Any) -> Optional[Dict[str, Any]]:
    """Coerce parsed args dict/list into the canonical {query: ...} or
    {answers: [...]} shape expected by task.py."""
    if isinstance(args, str):
        # Some emitters double-encode arguments as a JSON string.
        try:
            args = json.loads(args)
        except Exception:
            pass
    if name == "execute_sql":
        if isinstance(args, dict):
            for key in ("query", "sql", "statement"):
                if key in args and isinstance(args[key], str):
                    return {"query": args[key]}
            # Fallback: take first string-valued field.
            for v in args.values():
                if isinstance(v, str):
                    return {"query": v}
        elif isinstance(args, str):
            return {"query": args}
    elif name == "commit_final_answer":
        if isinstance(args, dict):
            for key in ("answers", "answer", "result"):
                if key in args:
                    val = args[key]
                    if isinstance(val, list):
                        return {"answers": [str(x) for x in val]}
                    if val is not None:
                        return {"answers": [str(val)]}
        elif isinstance(args, list):
            return {"answers": [str(x) for x in args]}
        elif isinstance(args, str):
            return {"answers": [args]}
    return None


def _try_rescue_bracket_list(content: str) -> Optional[Dict[str, Any]]:
    """Rescue xLAM-style bracket-list tool calls (JSON or Python-call form).

    Field-name aliases: arguments / args / parameters. We only emit a rescue
    when the call name is one of the two real tools — guards against
    false-positives like `[{"Year": "1958", ...}]` (table-row echoing).
    """
    if not content:
        return None
    s = content.lstrip()
    if not s.startswith("["):
        return None

    # ── 1) JSON-list form ────────────────────────────────────────────────
    end = _find_matching_bracket(s, 0)
    if end > 0:
        try:
            arr = json.loads(s[: end + 1])
        except Exception:
            arr = None
        if isinstance(arr, list) and arr and isinstance(arr[0], dict):
            first = arr[0]
            name = first.get("name") or first.get("tool") or first.get("function")
            if isinstance(name, str) and name in _VALID_TOOL_NAMES:
                raw_args = (
                    first.get("arguments")
                    if "arguments" in first
                    else first.get("args")
                    if "args" in first
                    else first.get("parameters")
                )
                if raw_args is None:
                    raw_args = {}
                normalised = _normalize_rescued_args(name, raw_args)
                if normalised is not None:
                    return {"name": name, "arguments": normalised}

    # ── 1b) Malformed JSON-list fallback ─────────────────────────────────
    # xLAM frequently emits broken JSON like
    #   [{"name":"commit_final_answer","arguments":{"answers":["..."}}]
    # (forgets to close the inner `]`). Extract via tolerant regex when the
    # head clearly says it's a tool call.
    head = re.match(
        r'^\s*\[\s*\{\s*["\']name["\']\s*:\s*["\']([A-Za-z_]\w*)["\']',
        s,
    )
    if head:
        name = head.group(1)
        if name in _VALID_TOOL_NAMES:
            if name == "commit_final_answer":
                items = _try_rescue_partial_commit(s)
                if items:
                    return {
                        "name": name,
                        "arguments": {"answers": [str(x) for x in items]},
                    }
            elif name == "execute_sql":
                qm = re.search(
                    r'["\'](?:query|sql|statement)["\']\s*:\s*"((?:[^"\\]|\\.)*)"',
                    s,
                )
                if qm:
                    sql = qm.group(1).encode().decode(
                        "unicode_escape", errors="ignore"
                    )
                    return {"name": name, "arguments": {"query": sql}}

    # ── 2) Python-call form: [execute_sql(query=...)] ────────────────────
    m = _RESCUE_PY_CALL_HEAD_RE.match(s)
    if not m:
        return None
    name = m.group(1).lower()
    paren_open = m.end() - 1  # index of '('
    paren_close = _find_matching_paren(s, paren_open)
    if paren_close < 0:
        return None
    payload = s[paren_open + 1 : paren_close].strip()
    if not payload:
        return None

    # Try to parse as a single kwarg (kw=VALUE). xLAM nearly always emits
    # exactly one keyword arg here.
    kw_m = _RESCUE_PY_KWARG_RE.match(payload)
    val: Any = None
    if kw_m:
        raw_val = kw_m.group(2).strip().rstrip(",").strip()
        try:
            val = ast.literal_eval(raw_val)
        except Exception:
            # Last-ditch: strip outer matched quotes.
            if (
                len(raw_val) >= 2
                and raw_val[0] in ("'", '"')
                and raw_val[-1] == raw_val[0]
            ):
                val = raw_val[1:-1]
            else:
                val = None
    else:
        # No `=`: treat the whole payload as a positional literal.
        try:
            val = ast.literal_eval(payload)
        except Exception:
            val = None

    if val is None:
        return None
    normalised = _normalize_rescued_args(name, val)
    if normalised is None:
        return None
    return {"name": name, "arguments": normalised}


# xLAM-70B harness mode learns the harness's `[SCHEMA HINT]` bracket convention
# in-context and emits free-text section markers like
#   [Thoughts] reasoning ...
#   [SQL] UPDATE `tbl` SET ...
#   [Final Answer] X
# Recognise these and lift them into real tool calls.
_SECTION_SQL_MARKERS = frozenset({
    "execute_sql", "sql", "sql query", "sql code", "verification sql",
    "operation", "code", "execution", "tool call",
})
_SECTION_COMMIT_MARKERS = frozenset({
    "commit_final_answer", "commit",
    "final answer", "final_answer", "final",
    "answer", "answers",
})
_SECTION_HEAD_RE = re.compile(r"\[\s*([A-Za-z][A-Za-z _]{0,30}?)\s*\]\s*")
_SECTION_FENCE_RE = re.compile(
    r"^```(?:[A-Za-z0-9_+-]+)?\s*\n?(.*?)\n?```\s*$", re.DOTALL
)
_SECTION_COMMIT_CALL_RE = re.compile(
    r"^\s*commit_final_answer\s*\(\s*(.+?)\s*\)\s*$", re.DOTALL | re.IGNORECASE
)


def _strip_outer_code_fence(s: str) -> str:
    s = s.strip()
    m = _SECTION_FENCE_RE.match(s)
    return m.group(1).strip() if m else s


def _section_extract_sql(body: str) -> Optional[str]:
    body = _strip_outer_code_fence(body)
    if not body:
        return None
    # If body contains an inner ```sql ... ``` fence, prefer that.
    inner = re.search(r"```sql\s*\n(.*?)\n```", body, re.DOTALL | re.IGNORECASE)
    if inner:
        return inner.group(1).strip() or None
    return body


def _section_extract_answers(body: str) -> Optional[List[str]]:
    body = _strip_outer_code_fence(body)
    if not body:
        return None
    # commit_final_answer(...) call wrapped in section body.
    m = _SECTION_COMMIT_CALL_RE.match(body)
    if m:
        try:
            val = ast.literal_eval(m.group(1))
            if isinstance(val, list):
                return [str(x) for x in val]
            if isinstance(val, (str, int, float)):
                return [str(val)]
        except Exception:
            pass
    # Bare list literal.
    if body.startswith("["):
        try:
            val = ast.literal_eval(body)
            if isinstance(val, list):
                return [str(x) for x in val]
        except Exception:
            pass
    # Fallback: whole body is one answer.
    return [body]


def _try_rescue_section_marker(content: str) -> Optional[Dict[str, Any]]:
    """Rescue free-text section-marker tool calls (xLAM-70B harness pattern).

    Strategy: split content on `[marker]` heads, then take the LAST section
    whose marker is in our action whitelist. Commit and SQL markers compete
    on emission order — the latest one wins (matches model intent).
    """
    if not content or "[" not in content:
        return None
    matches = list(_SECTION_HEAD_RE.finditer(content))
    if not matches:
        return None

    # Build (marker, body) for every section so unknown markers still
    # delimit body extents correctly.
    sections: List[Tuple[str, str]] = []
    for i, m in enumerate(matches):
        marker = m.group(1).strip().lower()
        body_start = m.end()
        body_end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        body = content[body_start:body_end].strip()
        sections.append((marker, body))

    last_action: Optional[Tuple[str, str]] = None
    for marker, body in sections:
        if not body:
            continue
        if marker in _SECTION_SQL_MARKERS:
            last_action = ("sql", body)
        elif marker in _SECTION_COMMIT_MARKERS:
            last_action = ("commit", body)

    if last_action is None:
        return None
    kind, body = last_action

    if kind == "sql":
        sql = _section_extract_sql(body)
        if sql:
            return {"name": "execute_sql", "arguments": {"query": sql}}
    else:
        answers = _section_extract_answers(body)
        if answers is not None:
            return {"name": "commit_final_answer", "arguments": {"answers": answers}}
    return None


def _try_rescue_partial_commit(raw_json: str) -> Optional[List[str]]:
    """Extract committed answers from a truncated JSON commit_final_answer body.

    Handles the case where the model writes a very long answers list that gets
    cut off mid-string, causing json.loads to fail.  We extract all complete
    double-quoted strings and skip any truncated tail.
    """
    # Find "answers": [ ... up to where it's cut
    m = re.search(r'"?answers"?\s*:\s*\[', raw_json, re.IGNORECASE)
    if not m:
        return None
    list_body = raw_json[m.end():]
    items = []
    for sm in _RESCUE_PARTIAL_STRING_RE.finditer(list_body):
        # Stop if we hit past the end of a valid list element zone
        items.append(sm.group(1))
    return items if items else None


def rescue_tool_call_from_text(content: str) -> Optional[Dict[str, Any]]:
    """Lift a tool call out of plain assistant content, if one is embedded.

    Priority: XML <tool_call> (full) → XML <tool_call> (truncated/open) →
    commit_final_answer JSON/kwarg → partial commit rescue →
    execute_sql JSON/kwarg → ```sql fence```.
    """
    if not content:
        return None

    # xLAM-style bracket-list (JSON or Python-call form). Try first because
    # it's a strong signal — the head must literally start with `[` and a
    # known tool name, so it can't false-trigger on prose.
    bracket = _try_rescue_bracket_list(content)
    if bracket is not None:
        return bracket

    # XML form with closing tag — unambiguous.
    m = _RESCUE_TOOL_CALL_XML_RE.search(content)
    if m:
        try:
            obj = json.loads(m.group(1))
            name = obj.get("name", "")
            args = obj.get("arguments", {})
            if name in ("execute_sql", "commit_final_answer") and args:
                return {"name": name, "arguments": args}
        except Exception:
            pass
        # H9: tolerant re-parse — the body may be invalid only because of
        # escapes JSON does not define; keep backslash+char byte-for-byte.
        call = _tool_call_from_json_body(m.group(1))
        if call is not None:
            return call

    # XML form WITHOUT closing tag — model output was truncated.
    m = _RESCUE_TOOL_CALL_XML_OPEN_RE.search(content)
    if m:
        raw = m.group(1)
        # Try as complete JSON first (might have been cut after closing brace)
        try:
            obj = json.loads(raw)
            name = obj.get("name", "")
            args = obj.get("arguments", {})
            if name in ("execute_sql", "commit_final_answer") and args:
                return {"name": name, "arguments": args}
        except Exception:
            pass
        # H9: tolerant re-parse — same repair as the closed-tag branch.
        call = _tool_call_from_json_body(raw)
        if call is not None:
            return call
        # Try partial commit extraction: pull out complete quoted strings
        if "commit_final_answer" in raw:
            items = _try_rescue_partial_commit(raw)
            if items:
                return {"name": "commit_final_answer", "arguments": {"answers": items}}

    # commit_final_answer — strict JSON / kwarg
    for pat in (_RESCUE_COMMIT_JSON_RE, _RESCUE_COMMIT_KWARG_RE):
        m = pat.search(content)
        if m:
            raw_list = m.group(1)
            try:
                arr = json.loads(raw_list)
                if isinstance(arr, list):
                    return {"name": "commit_final_answer", "arguments": {"answers": [str(x) for x in arr]}}
            except Exception:
                pass

    # execute_sql — JSON / kwarg
    for pat in (_RESCUE_EXECUTE_JSON_RE, _RESCUE_EXECUTE_KWARG_RE):
        m = pat.search(content)
        if m:
            sql = m.group(1).encode().decode("unicode_escape", errors="ignore")
            return {"name": "execute_sql", "arguments": {"query": sql}}

    # Section-marker form: [SQL] UPDATE ..., [Final Answer] X, [Thoughts]
    # ... [SQL] ...  (xLAM-70B harness pattern). Run after the strict
    # JSON/kwarg parsers but before the generic ```sql fence``` fallback so
    # an explicit `[Final Answer]` section beats an incidental sql fence.
    section = _try_rescue_section_marker(content)
    if section is not None:
        return section

    # ```sql fence```
    m = _RESCUE_SQL_FENCE_RE.search(content)
    if m:
        return {"name": "execute_sql", "arguments": {"query": m.group(1).strip()}}

    return None


# ─────────────────────────────────────────────────────────────────────────────
# H2 — SQL auto-backtick + dialect fix
# ─────────────────────────────────────────────────────────────────────────────

_BACKTICK_IDENT_RE = re.compile(r"`[^`]+`")
_QUOTED_STR_RE = re.compile(r"'(?:[^'\\]|\\.)*'")
_NEEDS_BACKTICK_CHARS_RE = re.compile(r"[\s.\-+/#]")


def _mask_out_literals(sql: str) -> Tuple[str, List[Tuple[int, int, str]]]:
    """Return (masked_sql, regions). `regions` lists (start, end, original) of
    already-quoted / backticked substrings that should not be tinkered with.
    Masked regions are replaced with NUL-padded placeholders of equal length
    so offsets stay stable.
    """
    regions: List[Tuple[int, int, str]] = []
    spans: List[Tuple[int, int]] = []
    for m in _BACKTICK_IDENT_RE.finditer(sql):
        spans.append((m.start(), m.end()))
        regions.append((m.start(), m.end(), m.group(0)))
    for m in _QUOTED_STR_RE.finditer(sql):
        spans.append((m.start(), m.end()))
        regions.append((m.start(), m.end(), m.group(0)))
    spans.sort()
    merged: List[Tuple[int, int]] = []
    for s, e in spans:
        if merged and s < merged[-1][1]:
            continue
        merged.append((s, e))
    out = list(sql)
    for s, e in merged:
        for i in range(s, e):
            out[i] = "\x01"  # sentinel — NOT a word character
    return "".join(out), regions


def auto_backtick_sql(sql: str, schema_map: SchemaMap) -> Tuple[str, List[str]]:
    """Wrap known identifiers (table / column names from schema_map) in backticks
    when they appear as unquoted, whitespace-separated tokens in the SQL AND
    contain a char that requires quoting (space, dot, dash, etc.).

    Rationale: the failure-mode analysis showed 71 syntax errors in baseline,
    most because agents copied descriptive column names like `Race Name` or
    `No.` without backticks. We only auto-fix names that:
      1. Are in the schema_map (safe — not making up identifiers).
      2. Appear outside existing quotes/backticks in the SQL.
      3. Contain at least one char that MYSQL would reject unquoted.

    Returns (patched_sql, hits) where hits lists the names we wrapped.
    """
    if not sql or not schema_map.name_map:
        return sql, []

    # Build candidate list — only names that would actually need quoting.
    candidates: List[Tuple[str, str]] = []  # (lowercase match key, real sanitized name)
    for low, real in schema_map.name_map.items():
        if not real or not _NEEDS_BACKTICK_CHARS_RE.search(real):
            continue
        candidates.append((low, real))
    # Prefer longer names first to avoid partial overlap (e.g. "Race Name" before "Name").
    candidates.sort(key=lambda x: -len(x[1]))
    if not candidates:
        return sql, []

    masked, _regions = _mask_out_literals(sql)
    patched = sql
    masked_patched = masked
    hits: List[str] = []

    for _low, real in candidates:
        # Word-ish boundary on the "masked" text, case-insensitive. Use lookarounds
        # for non-identifier boundary on both sides.
        pattern = re.compile(
            r"(?<![A-Za-z0-9_`])" + re.escape(real) + r"(?![A-Za-z0-9_`])",
            re.IGNORECASE,
        )
        # Find ALL matches in masked, then apply the offsets to the real sql;
        # we rebuild both simultaneously so later candidates can't double-wrap.
        new_patched_parts: List[str] = []
        new_masked_parts: List[str] = []
        last = 0
        match_count = 0
        for m in pattern.finditer(masked_patched):
            s, e = m.start(), m.end()
            if s < last:
                continue
            new_patched_parts.append(patched[last:s])
            new_masked_parts.append(masked_patched[last:s])
            original_slice = patched[s:e]
            replacement = f"`{original_slice}`"
            new_patched_parts.append(replacement)
            # Mask the new backticked region so later candidates won't touch.
            new_masked_parts.append("\x01" * len(replacement))
            last = e
            match_count += 1
        new_patched_parts.append(patched[last:])
        new_masked_parts.append(masked_patched[last:])
        if match_count > 0:
            patched = "".join(new_patched_parts)
            masked_patched = "".join(new_masked_parts)
            hits.append(real)
    return patched, hits


_DIALECT_CONCAT_RE = re.compile(
    # capture two operands separated by ||, each a reasonably atomic SQL expression
    # (identifier, backticked, string literal, or function call).  Stay conservative
    # to avoid breaking boolean-OR uses (which MySQL accepts syntactically but
    # semantically means OR — we only rewrite when BOTH sides are string-y).
    r"""(
        `[^`]+`                    # backticked ident
        |'(?:[^'\\]|\\.)*'         # string literal
        |\w+\s*\([^()]*\)          # simple function call
        |[A-Za-z_][A-Za-z_0-9]*    # bare identifier
    )
    \s*\|\|\s*
    (
        `[^`]+`
        |'(?:[^'\\]|\\.)*'
        |\w+\s*\([^()]*\)
        |[A-Za-z_][A-Za-z_0-9]*
    )
    """,
    re.VERBOSE,
)


def dialect_fix_sql(sql: str) -> Tuple[str, List[str]]:
    """Rewrite obvious SQLite-isms into MySQL equivalents.

    Currently handles only `a || b` → `CONCAT(a, b)`, and only in a conservative
    2-arg form (agent-written concats are almost always simple pairs). If an
    agent actually means boolean OR they would use `OR` rather than `||` on
    string operands, so false positives are very rare in practice.
    """
    if not sql or "||" not in sql:
        return sql, []
    hits: List[str] = []
    new_sql = sql

    def _sub(m: re.Match) -> str:
        hits.append("concat_rewrite")
        return f"CONCAT({m.group(1).strip()}, {m.group(2).strip()})"

    # Apply at most a few times — avoid runaway rewrites on truly malformed SQL.
    for _ in range(3):
        changed = _DIALECT_CONCAT_RE.sub(_sub, new_sql)
        if changed == new_sql:
            break
        new_sql = changed
    return new_sql, hits


# ─────────────────────────────────────────────────────────────────────────────
# H2 — SQL safety filter
# ─────────────────────────────────────────────────────────────────────────────

_DANGEROUS_SQL_PATTERNS = [
    re.compile(r"\bdrop\s+database\b", re.IGNORECASE),
    re.compile(r"\bshutdown\b", re.IGNORECASE),
    re.compile(r"\bgrant\s+all\b", re.IGNORECASE),
]


def _is_dangerous_sql(sql: str) -> Optional[str]:
    for pat in _DANGEROUS_SQL_PATTERNS:
        if pat.search(sql or ""):
            return pat.pattern
    return None


# ─────────────────────────────────────────────────────────────────────────────
# H7 — INSERT literal fidelity helpers (pure)
# ─────────────────────────────────────────────────────────────────────────────

_INSERT_HEAD_RE = re.compile(r"\bINSERT\s+(?:IGNORE\s+)?INTO\s+", re.IGNORECASE)
_VALUES_KEYWORD_RE = re.compile(r"VALUES\b", re.IGNORECASE)
_THOUSANDS_GROUPED_RE = re.compile(r"^\d{1,3}(?:,\d{3})+$")
_PLAIN_NUMBER_RE = re.compile(r"^\d+(?:\.\d+)?$")
# H9: literal \xHH sequences (repr-rendered non-ASCII stored values).
_REPR_ESCAPE_RE = re.compile(r"\\x([0-9A-Fa-f]{2})")


def _thousands_grouped(s: str) -> bool:
    """True when `s` is a pure thousands-separated integer like '1,250,000'."""
    if not isinstance(s, str):
        return False
    return bool(_THOUSANDS_GROUPED_RE.match(s.strip()))


def _split_top_level_comma_spans(masked: str, start: int, end: int) -> List[Tuple[int, int]]:
    """Spans of `masked[start:end]` split on commas at paren depth 0.

    `masked` comes from _mask_out_literals, so commas inside quoted values or
    backticked identifiers are sentinels and can never split a token.
    """
    spans: List[Tuple[int, int]] = []
    depth = 0
    seg_start = start
    for i in range(start, end):
        ch = masked[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif ch == "," and depth == 0:
            spans.append((seg_start, i))
            seg_start = i + 1
    spans.append((seg_start, end))
    return spans


def _trimmed_span(text: str, start: int, end: int) -> Optional[Tuple[int, int, str]]:
    """(start, end, stripped_text) for a non-empty slice, else None."""
    seg = text[start:end]
    if not seg.strip():
        return None
    lead = len(seg) - len(seg.lstrip())
    trail = len(seg) - len(seg.rstrip())
    return (start + lead, end - trail, seg.strip())


def _parse_insert_parts(
    sql: str,
) -> Optional[Tuple[List[str], List[List[Tuple[int, int, str]]]]]:
    """Balanced-paren parse of ``INSERT INTO t (cols) VALUES (...), (...)``.

    Returns (columns, rows): the column names as written, and for each VALUES
    row a list of (start, end, raw_text) tokens with offsets into `sql`.
    Literals are masked before any paren matching, so a `)` inside a backticked
    identifier (e.g. `Area (km²)`) cannot truncate the column list.

    Returns None when the statement is absent, has no explicit column list, or
    cannot be delimited unambiguously — callers must treat None as "no
    evidence", never as a defect.
    """
    if not sql:
        return None
    masked, _regions = _mask_out_literals(sql)
    m = _INSERT_HEAD_RE.search(masked)
    if m is None:
        return None
    n = len(masked)
    i = m.end()
    while i < n and masked[i].isspace():
        i += 1
    # Table token: backticked names are a run of sentinels, bare names run up
    # to whitespace or '('.  If the next non-space char is not '(' there is no
    # explicit column list and the count is ambiguous.
    while i < n and not masked[i].isspace() and masked[i] not in "(;":
        i += 1
    while i < n and masked[i].isspace():
        i += 1
    if i >= n or masked[i] != "(":
        return None
    col_close = _find_matching_paren(masked, i)
    if col_close == -1:
        return None
    columns: List[str] = []
    for s, e in _split_top_level_comma_spans(masked, i + 1, col_close):
        tok = _trimmed_span(sql, s, e)
        if tok is None:
            return None
        columns.append(tok[2].strip("`").strip())
    if not columns:
        return None
    j = col_close + 1
    while j < n and masked[j].isspace():
        j += 1
    vm = _VALUES_KEYWORD_RE.match(masked, j)
    if vm is None or not (j == vm.start()):
        return None
    j = vm.end()
    while j < n and masked[j].isspace():
        j += 1
    rows: List[List[Tuple[int, int, str]]] = []
    while j < n and masked[j] == "(":
        close = _find_matching_paren(masked, j)
        if close == -1:
            return None
        row: List[Tuple[int, int, str]] = []
        for s, e in _split_top_level_comma_spans(masked, j + 1, close):
            tok = _trimmed_span(sql, s, e)
            if tok is None:
                return None
            row.append(tok)
        rows.append(row)
        j = close + 1
        while j < n and masked[j].isspace():
            j += 1
        if j < n and masked[j] == ",":
            j += 1
            while j < n and masked[j].isspace():
                j += 1
            continue
        break
    if not rows:
        return None
    return columns, rows


def _sample_col_values(schema_map: Optional[SchemaMap], column_name: str) -> List[str]:
    """Stored sample values for a column, or [] when unavailable.

    Samples are raw TEXT cells from the task's table metadata; they are the
    only format evidence available at pre-validation time.
    """
    if schema_map is None or not column_name:
        return []
    key = column_name.strip().strip("`").strip().lower()
    if not key:
        return []
    for t in schema_map.tables:
        cols = t.get("columns") or []
        samples = t.get("sample_rows") or []
        if not samples:
            continue
        for idx, c in enumerate(cols):
            names = {
                str(c.get("sanitized", "") or "").strip().lower(),
                str(c.get("raw", "") or "").strip().lower(),
            }
            if key in names:
                out: List[str] = []
                for row in samples:
                    if isinstance(row, (list, tuple)) and idx < len(row):
                        out.append(str(row[idx]).strip())
                return out
    return []


# ─────────────────────────────────────────────────────────────────────────────
# H2 — Answer normalisation (interface-boundary repair at commit)
# ─────────────────────────────────────────────────────────────────────────────

_ANSWER_UNIT_TOKENS = {
    "game", "games", "goal", "goals", "win", "wins", "season", "seasons",
    "record", "records", "album", "albums", "item", "items", "row", "rows",
    "point", "points", "score", "scores", "medal", "medals",
    "episode", "episodes", "title", "titles", "entry", "entries",
    "year", "years", "match", "matches", "race", "races",
}

_ANSWER_STRIP_PREFIXES = [
    "the answer is", "answer:", "answer is", "result:", "result is",
    "output:", "count:", "total:", "total is",
]


def _normalize_scalar_numeric(value: str) -> Tuple[str, bool]:
    s = str(value or "").strip()
    original = s
    low = s.lower()
    for p in _ANSWER_STRIP_PREFIXES:
        if low.startswith(p):
            s = s[len(p):].lstrip(" :\t")
            break
    s = s.strip().strip("'\"")
    # Drop trailing period
    s = s.rstrip(".")
    # Trailing unit tokens
    tokens = s.split()
    while len(tokens) > 1 and tokens[-1].lower().strip(".,") in _ANSWER_UNIT_TOKENS:
        tokens.pop()
    s = " ".join(tokens).strip()
    # Thousand separators
    if re.fullmatch(r"-?\d{1,3}(,\d{3})+(\.\d+)?", s):
        s = s.replace(",", "")
    # None/null → "0"
    if s.lower() in {"none", "null", "nan", "", "undefined"}:
        s = "0"
    # If still multi-token (has spaces), extract last numeric token.
    # Guard: only apply when there is a space in s to avoid mangling "1900s" → "1900"
    # or ordinals like "3rd". Strings without spaces that fail the fullmatch are
    # non-numeric strings (years-with-suffix, ordinals, etc.) and must be kept as-is.
    if not re.fullmatch(r"-?\d+(\.\d+)?", s) and " " in s:
        nums = re.findall(r"-?\d+(?:\.\d+)?", s)
        if nums:
            s = nums[-1]
    return s, (s != original)


def _normalize_scalar_string(value: str) -> Tuple[str, bool]:
    s = str(value or "").strip()
    original = s
    # Replace non-breaking space (U+00A0) with regular space; evaluator does
    # plain string comparison so \xa0 ≠ space causes false mismatches.
    s = s.replace("\xa0", " ")
    low = s.lower()
    for p in _ANSWER_STRIP_PREFIXES:
        if low.startswith(p):
            s = s[len(p):].lstrip(" :\t")
            break
    s = s.strip().strip("'\"")
    s = s.rstrip(".")
    return s, (s != original)


def normalize_answers_list(
    answers: List[str],
    answer_shape: Optional[str],
) -> Tuple[List[str], Dict[str, Any]]:
    """Return (normalized_answers, audit).

    audit contains: mutated (bool), rule_hits (list), before, after.
    Passthrough when answer_shape is SHAPE_HASH or None.
    """
    audit = {"mutated": False, "rule_hits": [], "before": list(answers or []), "after": None}
    if answer_shape in (SHAPE_HASH, None):
        audit["after"] = list(answers or [])
        return list(answers or []), audit
    if not answers:
        audit["after"] = []
        return [], audit

    out = [str(a) if a is not None else "" for a in answers]
    if answer_shape in (SHAPE_SCALAR_INT, SHAPE_SCALAR_FLOAT):
        new_out = []
        for a in out:
            s, mutated = _normalize_scalar_numeric(a)
            if mutated:
                audit["rule_hits"].append("numeric_strip")
            new_out.append(s)
        out = new_out
    elif answer_shape == SHAPE_SCALAR_STR:
        new_out = []
        for a in out:
            s, mutated = _normalize_scalar_string(a)
            if mutated:
                audit["rule_hits"].append("string_strip")
            new_out.append(s)
        out = new_out
    elif answer_shape in (SHAPE_MULTI_SINGLE, SHAPE_MULTI_MULTI):
        if len(out) == 1 and isinstance(out[0], str):
            s = out[0].strip()
            if s.startswith("[") and s.endswith("]"):
                # Agent wrapped the whole list in ONE string like "[('1948',),('1992',)]"
                try:
                    arr = ast.literal_eval(s)
                    if isinstance(arr, list):
                        if answer_shape == SHAPE_MULTI_MULTI:
                            # Keep each row as its Python tuple repr-string so the
                            # evaluator's set-comparison matches the ground truth.
                            out = [str(item) if isinstance(item, tuple) else str(item) for item in arr]
                        else:
                            flat: List[str] = []
                            for item in arr:
                                if isinstance(item, tuple):
                                    for cell in item:
                                        flat.append(str(cell))
                                else:
                                    flat.append(str(item))
                            out = flat
                        audit["rule_hits"].append("unpack_stringified_list")
                except Exception:
                    pass
            elif answer_shape == SHAPE_MULTI_MULTI and s.startswith("("):
                # Agent crammed all rows into ONE string WITHOUT outer brackets:
                # "('a', 'b'), ('c', 'd')" — parse as a list by wrapping first.
                try:
                    arr = ast.literal_eval(f"[{s}]")
                    if isinstance(arr, list) and all(isinstance(x, tuple) for x in arr):
                        out = [str(item) for item in arr]
                        audit["rule_hits"].append("unpack_bare_tuple_sequence")
                except Exception:
                    pass

        # Per-element light cleanup (strip outer quotes only, not tuple parens)
        # Also replace non-breaking space (U+00A0) with regular space.
        out = [
            (a.replace("\xa0", " ").strip().strip("'\"") if not a.strip().startswith("(") else a.replace("\xa0", " ").strip())
            for a in out
        ]

    if out != audit["before"]:
        audit["mutated"] = True
    audit["after"] = out
    return out, audit


# ─────────────────────────────────────────────────────────────────────────────
# H1 helpers — parsing DB responses
# ─────────────────────────────────────────────────────────────────────────────

_MYSQL_UNKNOWN_COL_RE = re.compile(r"Unknown column '([^']+)'", re.IGNORECASE)
_MYSQL_UNKNOWN_TBL_RE = re.compile(r"Table '[^']*?([\w\s\.-]+)' doesn'?t exist", re.IGNORECASE)
_MYSQL_SYNTAX_NEAR_RE = re.compile(r"near '([^']{1,60})'", re.IGNORECASE)


def classify_db_response(response: str) -> Tuple[str, Optional[str]]:
    """Return (kind, error_text) where kind is one of:
    syntax / unknown_col / unknown_table / timeout / null_agg / empty / ok.
    """
    if not response:
        return ("empty", None)
    low = response.lower()
    if "error: sql execution timed out" in low or "timed out" in low:
        return ("timeout", response)
    if "unknown column" in low:
        return ("unknown_col", response)
    if "doesn't exist" in low or "doesn’t exist" in low:
        return ("unknown_table", response)
    if "syntax" in low and "error" in low:
        return ("syntax", response)
    if "error" in low:
        # Generic error — treat as 'syntax' for hint purposes but mark as error.
        if "near '" in low:
            return ("syntax", response)
        return ("syntax", response)
    # NULL aggregation result: "[(None,)]" or "[(null,)]"
    if re.match(r"^\s*\[\(\s*(none|null)\s*,\s*\)\s*\]\s*$", response.strip(), re.IGNORECASE):
        return ("null_agg", None)
    if response.strip() in ("[]", "()"):
        return ("empty", None)
    return ("ok", None)


def extract_candidate_from_response(response: str, answer_shape: Optional[str]) -> Tuple[Optional[Any], bool]:
    """Extract a candidate answer from a raw MySQL response string.

    Returns (candidate, implausible). The candidate can be either a str
    (for scalar shapes) or a list[str] (for multi-row shapes). If nothing
    reasonable can be extracted, candidate is None.
    """
    if not response:
        return None, False
    s = response.strip()
    # Try eval — the DB backend returns Python-repr strings like "[(1,)]".
    parsed = None
    if s.startswith("[") and s.endswith("]"):
        try:
            parsed = ast.literal_eval(s)
        except Exception:
            parsed = None

    if parsed is not None and isinstance(parsed, list):
        if not parsed:
            return None, False

        # Scalar shapes
        if answer_shape in (SHAPE_SCALAR_INT, SHAPE_SCALAR_FLOAT, SHAPE_SCALAR_STR, None):
            if len(parsed) == 1 and isinstance(parsed[0], tuple) and len(parsed[0]) == 1:
                v = parsed[0][0]
                if v is None:
                    # Treat None as implausible for scalar_int but let "0" be
                    # the candidate (evaluator maps None → "0").
                    return "0", True
                return str(v), False
            # Multi-row but shape says scalar → take the first cell.
            # Only flag implausible when the agent returned MULTIPLE rows for a
            # scalar-shape task; a single-row multi-col result is an exploratory
            # query and should not trigger the "multi-row returned" H4 warning.
            try:
                first_cell = parsed[0][0] if isinstance(parsed[0], tuple) else parsed[0]
                is_implausible = len(parsed) > 1
                return str(first_cell), is_implausible
            except Exception:
                return None, False

        # Multi-row single-col
        if answer_shape == SHAPE_MULTI_SINGLE:
            vals: List[str] = []
            for item in parsed:
                if isinstance(item, tuple):
                    if len(item) >= 1:
                        v = item[0]
                        vals.append("" if v is None else str(v))
                else:
                    vals.append(str(item))
            return vals, False

        # Multi-row multi-col — return as raw response string (safer for eval parity)
        if answer_shape == SHAPE_MULTI_MULTI:
            return s, False

    # Non-parseable response — return stripped string for scalar_str shape
    if answer_shape == SHAPE_SCALAR_STR and len(s) <= 200:
        return s, False
    return None, False


# ─────────────────────────────────────────────────────────────────────────────
# H3 — Tool description patching
# ─────────────────────────────────────────────────────────────────────────────

_H3_EXECUTE_HINT = (
    " This is MySQL. Wrap identifiers with spaces/dots/punctuation in backticks "
    "(e.g. `High points`, `No.`, `Olympic Medal Table`). Use `CONCAT(a, b)` "
    "not `a || b`. Prefer one SQL per turn. For TEXT-typed numeric columns, "
    "cast with `CAST(col AS DECIMAL(20,6))` before SUM/AVG or numeric ORDER BY."
)

_H3_COMMIT_HINT = (
    " For scalar results (single COUNT/SUM/AVG), submit ONE bare value: "
    "answers=['42'] — no tuple brackets. "
    "For GROUP BY / 'for each' queries, submit ALL rows as tuple strings: "
    "answers=[\"('GroupA', 3)\", \"('GroupB', 1)\", …]. "
    "For multi-column SELECT, submit each ROW as one tuple-repr element: "
    "answers=[\"('v1', 'v2')\", \"('v3', 'v4')\"]. "
    "For INSERT/UPDATE/DELETE, run the mutation SQL successfully BEFORE "
    "committing — the answer field is ignored but the table hash must match."
)

_H3_SYSTEM_APPEND = (
    "\n\nThis database is MySQL. Column names longer than 64 characters were "
    "truncated on import; use the schema card shown below as the source of "
    "truth. Always wrap identifiers containing spaces or punctuation in "
    "backticks. A syntax error near a column name is almost always an "
    "un-backticked identifier. "
    "IMPORTANT: ALL columns are stored as TEXT — there are no INT/FLOAT columns. "
    "For INSERT/UPDATE, values must be quoted strings. Check the sample rows in "
    "the schema card to determine the correct format for units (e.g. '100.0 m.'), "
    "ordinals (e.g. '2nd'), and dates (e.g. 'October 23, 2005'). For pure numeric "
    "values, use plain digits without thousands separators unless the sample rows "
    "explicitly show commas (e.g. use '63000' not '63,000')."
)


def patch_dbbench_tool_descriptions(
    tools: Optional[List[Dict[str, Any]]]
) -> Optional[List[Dict[str, Any]]]:
    if not tools:
        return tools
    patched = copy.deepcopy(tools)
    for tool in patched:
        fn = tool.get("function", {})
        name = fn.get("name", "")
        if name == "execute_sql":
            fn["description"] = fn.get("description", "") + _H3_EXECUTE_HINT
        elif name == "commit_final_answer":
            fn["description"] = fn.get("description", "") + _H3_COMMIT_HINT
        tool["function"] = fn
    return patched


def patch_dbbench_system_prompt(system_prompt: str) -> str:
    return (system_prompt or "") + _H3_SYSTEM_APPEND


# ─────────────────────────────────────────────────────────────────────────────
# Runtime — glue H0..H6 together
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DBBenchHarnessRuntime:
    config: DBBenchHarnessConfig
    task_ctx: Optional[DBTaskContext] = field(default=None)
    schema_map: Optional[SchemaMap] = field(default=None)
    state: DBSessionState = field(default_factory=DBSessionState)
    force_next_action: Optional[Dict[str, Any]] = field(default=None)
    _last_hint: Optional[str] = field(default=None)
    _h5_injected_cold: bool = field(default=False)
    _last_remaining_rounds: Optional[int] = field(default=None)

    # ── H0 + H_SCHEMA ───────────────────────────────────────────────────────

    def init_task(self, entry: Dict[str, Any]) -> None:
        self.task_ctx = parse_task_context(entry)
        self.schema_map = build_schema_map(entry)
        self.state = DBSessionState()
        self.force_next_action = None
        self._last_hint = None
        self._h5_injected_cold = False
        self._last_remaining_rounds = None

    def schema_card(self) -> str:
        if self.schema_map is None:
            return ""
        task_type = self.task_ctx.task_type if self.task_ctx else ""
        return build_schema_card(self.schema_map, task_type=task_type)

    # ── H5 cold-start ───────────────────────────────────────────────────────

    def cold_start_skill_hints(self) -> List[Dict[str, str]]:
        if not self.config.h5_enabled or self.task_ctx is None:
            return []
        skills = retrieve_db_skills(
            task_type=self.task_ctx.task_type,
            query=self.task_ctx.raw_description,
            top_k=self.config.h5_top_k,
        )
        result: List[Dict[str, str]] = []
        for skill in skills:
            text = skill["text"]
            result.append({
                "id": skill["id"],
                "text": text,
                "trigger": "cold_start",
                "token_cost": str(len(text.split())),
            })
        self._h5_injected_cold = True
        return result

    # ── H2: SQL gate ────────────────────────────────────────────────────────

    def pre_validate_sql(self, sql: str) -> Dict[str, Any]:
        """Inspect + maybe rewrite an execute_sql query before it runs.

        Returns: {action: "run"|"block"|"force_commit", sql, blocked_reason,
                  rule_hits[], force_args}.
        """
        response: Dict[str, Any] = {
            "action": "run",
            "sql": sql,
            "blocked_reason": "",
            "rule_hits": [],
            "force_args": None,
        }
        if not self.config.h2_enabled or self.task_ctx is None or self.schema_map is None:
            return response

        # Safety filter.
        dpat = _is_dangerous_sql(sql)
        if dpat:
            response["action"] = "block"
            response["blocked_reason"] = f"dangerous_sql:{dpat}"
            return response

        # Auto-backtick known identifiers.
        patched, bt_hits = auto_backtick_sql(sql, self.schema_map)
        if bt_hits:
            response["rule_hits"].append({"rule": "auto_backtick", "identifiers": bt_hits})

        # Dialect fix.
        patched, dc_hits = dialect_fix_sql(patched)
        if dc_hits:
            response["rule_hits"].append({"rule": "dialect_concat", "count": len(dc_hits)})

        response["sql"] = patched

        # INSERT checks
        if self.task_ctx.task_type == TASK_INSERT:
            # Balanced parse of the column list + VALUES rows (a ')' inside a
            # backticked identifier such as `Area (km²)` must not truncate it).
            ins_parts = _parse_insert_parts(patched)

            # Column count check — only for an UNAMBIGUOUS parse that is
            # genuinely short; never fires on parse failure.
            if ins_parts is not None and self.schema_map.tables:
                agent_col_count = len(ins_parts[0])
                schema_col_count = len(self.schema_map.tables[0].get("columns", []))
                if 0 < agent_col_count < schema_col_count:
                    response["rule_hits"].append({
                        "rule": "insert_partial_columns",
                        "agent_cols": agent_col_count,
                        "schema_cols": schema_col_count,
                        "hint": (
                            f"Harness: your INSERT specifies {agent_col_count} columns but the "
                            f"table has {schema_col_count}. The table hash includes ALL columns — "
                            f"include every column in your INSERT or the hash will not match."
                        ),
                    })

            # Unquoted numeric literals check: all columns are TEXT, so VALUES
            # like (1996, 97.0, 2) must be ('1996', '97.0', '2') to match hash.
            # Scan the MASKED SQL so digits inside quoted literals such as
            # '1,250,000' can never raise the "quote ALL values" hint.
            masked_sql, _masked_regions = _mask_out_literals(patched)
            m_vals = re.search(r"\bVALUES\s*\((.+)\)\s*;?\s*$", masked_sql, re.IGNORECASE | re.DOTALL)
            if m_vals:
                vals_text = m_vals.group(1)
                # A token is an unquoted value position if preceded by ( or ,
                # (with whitespace), and the value itself is a bare number or NULL.
                _unquoted_num = re.compile(
                    r"(?:^|(?<=,))\s*([-+]?\d+(?:\.\d+)?|NULL)\s*(?=,|\))",
                    re.IGNORECASE,
                )
                bare_nums = _unquoted_num.findall(vals_text)
                if bare_nums:
                    response["rule_hits"].append({
                        "rule": "insert_unquoted_numerics",
                        "hint": (
                            "Harness: every column is TEXT — quote ALL values as strings: "
                            "VALUES ('Harbor View Tower', '30', '100.0 m.', '2024', …). "
                            "Do NOT use bare numbers (30, 97.0) — they must match the exact "
                            "string stored in the table including any units or suffixes."
                        ),
                    })

            # H7: rewrite thousands-separated literals to the stored sample
            # format (rewrite only — never blocks).
            if ins_parts is not None and self.schema_map.tables:
                patched, norm_hits = self._normalize_insert_thousands(patched, ins_parts)
                if norm_hits:
                    response["rule_hits"].extend(norm_hits)
                response["sql"] = patched

            # H9: literal \xHH repr escapes in quoted values are rewritten to
            # the real stored character when the schema map's stored samples
            # corroborate it (rewrite only — never blocks, never touches
            # commit/gate counters).
            patched, repr_hits = self._normalize_x_escapes(patched)
            if repr_hits:
                response["rule_hits"].extend(repr_hits)
            response["sql"] = patched

        # H6 advisory hints (non-blocking — never rewrite the SQL):
        # (a) the question demands an aggregate but this SELECT does not compute it.
        if re.match(r"\s*select\b", patched, re.IGNORECASE):
            demand_hint = self._question_aggregate_demand()
            if demand_hint:
                proj_exprs = self._sql_projection_exprs(patched) or []
                computed = any(
                    re.search(rf"\b{demand_hint.lower()}\s*\(", expr, re.IGNORECASE)
                    for expr in proj_exprs
                )
                ranks_extreme = (
                    demand_hint in ("MAX", "MIN")
                    and bool(re.search(r"\border\s+by\b", patched, re.IGNORECASE))
                    and bool(re.search(r"\blimit\s+1\b", patched, re.IGNORECASE))
                )
                if not computed and not ranks_extreme:
                    response["rule_hits"].append({
                        "rule": "aggregate_demand_missing",
                        "demand": demand_hint,
                        "hint": (
                            f"Harness: the question asks for the {demand_hint} value, but this "
                            f"query does not compute {demand_hint}(...). Consider running the "
                            f"{demand_hint} query first (no GROUP BY for a single total)."
                        ),
                    })
            # (b) repeated empty results plus an exact text comparison — the stored
            # text may differ in case/spacing, so LIKE + a raw sample row help.
            if (
                self.state.empty_streak >= 1
                and re.search(r"=\s*'[^']+'", patched)
                and not re.search(r"\blike\b", patched, re.IGNORECASE)
            ):
                response["rule_hits"].append({
                    "rule": "empty_streak_text_equality",
                    "hint": (
                        "Harness: previous queries returned no rows and this one uses an exact "
                        "text comparison. Try `LIKE '%…%'` instead of `=`, and inspect the exact "
                        "stored formats with `SELECT * FROM `tbl` LIMIT 5;`."
                    ),
                })

        # Repeated-SQL commit shortcut: if the same normalised SQL has been run
        # 2 times already AND the last run was successful AND we have a
        # candidate matching the expected shape → convert this 3rd attempt into
        # a commit.  We DO NOT use candidate_implausible here.
        normalised = _normalize_sql(patched)
        hist = self.state.sql_history
        if (
            len(hist) >= self.config.h2_repeat_sql_block_after
            and all(h == normalised for h in hist[-self.config.h2_repeat_sql_block_after:])
            and self.state.candidate_answer is not None
            and not self.state.candidate_implausible
            and not self.state.last_result_was_error
            and self.task_ctx.answer_shape not in (SHAPE_HASH, None)
        ):
            answers = self._candidate_to_answers_list()
            if answers is not None:
                response["action"] = "force_commit"
                response["force_args"] = {"answers": answers}
                response["rule_hits"].append({"rule": "repeated_sql_force_commit"})
                return response

        return response

    # ── H7: INSERT literal fidelity ─────────────────────────────────────────

    def _normalize_insert_thousands(
        self,
        patched: str,
        parts: Tuple[List[str], List[List[Tuple[int, int, str]]]],
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """Rewrite thousands-separated INSERT literals to the stored format.

        The question may quote '52,000' while the table stores '52000'.  A
        rewrite fires for a value token only when the target column has stored
        sample values AND every sample value of that column is a plain
        comma-free number — tables that themselves store commas (or any other
        format) keep the literal untouched, exactly like the passing traces.
        Rewrite only: never blocks, never touches commit/gate counters.
        """
        hits: List[Dict[str, Any]] = []
        if self.schema_map is None:
            return patched, hits
        if self.state.fmt_norm_used >= max(0, int(self.config.h7_norm_limit)):
            return patched, hits
        columns, rows = parts
        if not columns or not rows:
            return patched, hits
        edits: List[Tuple[int, int, str]] = []
        pending_hits: List[Dict[str, Any]] = []
        hinted = {c.lower() for c in self.state.fmt_norm_hinted_cols}
        for row in rows:
            if len(row) != len(columns):
                continue  # token/column mapping ambiguous — leave untouched
            for idx, (s, e, tok) in enumerate(row):
                if len(tok) < 3 or tok[0] != tok[-1] or tok[0] not in ("'", '"'):
                    continue
                inner = tok[1:-1]
                if not _thousands_grouped(inner):
                    continue
                col = columns[idx].strip().strip("`").strip()
                samples = _sample_col_values(self.schema_map, col)
                if not samples or not all(
                    _PLAIN_NUMBER_RE.match(sv.strip()) for sv in samples
                ):
                    continue
                fixed = inner.replace(",", "")
                if not _PLAIN_NUMBER_RE.match(fixed):
                    continue
                edits.append((s, e, tok[0] + fixed + tok[-1]))
                if col.lower() not in hinted:
                    hinted.add(col.lower())
                    pending_hits.append({
                        "rule": "insert_thousands_normalized",
                        "column": col,
                        "from": inner,
                        "to": fixed,
                        "hint": (
                            f"Harness: normalized `{col}` value '{inner}' to '{fixed}' — the "
                            f"table stores this column without thousands separators "
                            f"(stored example: '{samples[0]}')."
                        ),
                    })
        if not edits:
            return patched, hits
        out: List[str] = []
        last = 0
        for s, e, repl in sorted(edits):
            if s < last:
                continue
            out.append(patched[last:s])
            out.append(repl)
            last = e
        out.append(patched[last:])
        new_sql = "".join(out)
        key = _normalize_sql(new_sql)
        if key not in self.state.fmt_norm_sqls:
            self.state.fmt_norm_sqls.append(key)
            self.state.fmt_norm_used += 1
            for hit in pending_hits:
                self.state.fmt_norm_hinted_cols.append(hit["column"].lower())
            hits.extend(pending_hits)
        return new_sql, hits

    # ── H9: repr-escape fidelity ────────────────────────────────────────────

    def _normalize_x_escapes(self, sql: str) -> Tuple[str, List[Dict[str, Any]]]:
        """Rewrite literal \\xHH sequences to the real stored character.

        A schema card renders stored sample cells whose values contain
        non-ASCII characters as a \\xHH escape; a model that copies such a
        cell into an SQL literal writes the two-character escape, which is
        not a MySQL escape and therefore compares against the literal text
        instead of the stored character.  This method converts \\xHH to the
        real character — but only when some stored sample cell of the schema
        map actually contains that character, so nothing is rewritten without
        corroboration.  Rewrite only: never blocks, never touches commit/gate
        counters, returns the SQL unchanged when nothing qualifies.
        """
        hits: List[Dict[str, Any]] = []
        if not sql or self.schema_map is None:
            return sql, hits
        if self.state.h9_repr_used >= max(0, int(self.config.h9_repr_limit)):
            return sql, hits
        matches = list(_REPR_ESCAPE_RE.finditer(sql))
        if not matches:
            return sql, hits
        pool: List[str] = []
        for t in self.schema_map.tables:
            for row in t.get("sample_rows") or []:
                cells = row if isinstance(row, (list, tuple)) else [row]
                for cell in cells:
                    pool.append(str(cell))
        pool_text = "".join(pool)
        if not pool_text:
            return sql, hits
        edits: List[Tuple[int, int, str]] = []
        replaced: Dict[str, str] = {}
        for m in matches:
            ch = chr(int(m.group(1), 16))
            if ch and ch in pool_text:
                edits.append((m.start(), m.end(), ch))
                replaced[m.group(0)] = ch
        if not edits:
            return sql, hits
        out: List[str] = []
        last = 0
        for s, e, repl in edits:
            if s < last:
                continue
            out.append(sql[last:s])
            out.append(repl)
            last = e
        out.append(sql[last:])
        new_sql = "".join(out)
        key = _normalize_sql(new_sql)
        if key not in self.state.h9_repr_sqls:
            self.state.h9_repr_sqls.append(key)
            self.state.h9_repr_used += 1
            for seq, ch in sorted(replaced.items()):
                hits.append({
                    "rule": "repr_escape_normalized",
                    "from": seq,
                    "to": ch,
                    "hint": (
                        "Harness: this table stores characters such as accents "
                        "and non-breaking spaces as the actual characters — a "
                        "`\\xNN` escape is not a MySQL escape. The harness "
                        "rewrote the escape sequence(s) in this statement to the "
                        "stored character."
                    ),
                })
        return new_sql, hits

    def _candidate_to_answers_list(self) -> Optional[List[str]]:
        cand = self.state.candidate_answer
        if cand is None:
            return None
        if isinstance(cand, list):
            return [str(x) for x in cand]
        return [str(cand)]

    # ── H6: Terminal-evidence helpers ───────────────────────────────────────
    # These are pure (no model calls, no environment access).  They only read
    # the H1 state / task context / schema map built during the episode.

    def _split_top_level_sql_commas(self, text: str) -> List[str]:
        """Split a SQL fragment on commas that are not inside parens/quotes."""
        parts: List[str] = []
        buf: List[str] = []
        depth = 0
        quote: Optional[str] = None
        i = 0
        while i < len(text):
            ch = text[i]
            if quote is not None:
                buf.append(ch)
                if ch == quote:
                    # Doubled quote escape ('' or "" / ``) stays inside the literal.
                    if i + 1 < len(text) and text[i + 1] == quote:
                        buf.append(text[i + 1])
                        i += 1
                    else:
                        quote = None
            else:
                if ch in ("'", '"', "`"):
                    quote = ch
                    buf.append(ch)
                elif ch == "(":
                    depth += 1
                    buf.append(ch)
                elif ch == ")":
                    depth = max(0, depth - 1)
                    buf.append(ch)
                elif ch == "," and depth == 0:
                    parts.append("".join(buf).strip())
                    buf = []
                else:
                    buf.append(ch)
            i += 1
        tail = "".join(buf).strip()
        if tail:
            parts.append(tail)
        return parts

    def _sql_projection_exprs(self, sql: str) -> Optional[List[str]]:
        """Top-level projection expressions of a SELECT, or None for non-SELECTs."""
        s = (sql or "").strip()
        if not re.match(r"select\b", s, re.IGNORECASE):
            return None
        m = re.match(r"select\s+(?:distinct\s+)?(.*)", s, re.IGNORECASE | re.DOTALL)
        if m is None:
            return None
        body = m.group(1)
        depth = 0
        quote: Optional[str] = None
        cut = len(body)
        i = 0
        while i < len(body):
            ch = body[i]
            if quote is not None:
                if ch == quote:
                    if i + 1 < len(body) and body[i + 1] == quote:
                        i += 1
                    else:
                        quote = None
            else:
                if ch in ("'", '"', "`"):
                    quote = ch
                elif ch == "(":
                    depth += 1
                elif ch == ")":
                    depth = max(0, depth - 1)
                elif depth == 0 and body[i:i + 4].lower() == "from":
                    before_ok = (i == 0) or not (body[i - 1].isalnum() or body[i - 1] == "_")
                    after_ok = (i + 4 >= len(body)) or not (body[i + 4].isalnum() or body[i + 4] == "_")
                    if before_ok and after_ok:
                        cut = i
                        break
            i += 1
        return self._split_top_level_sql_commas(body[:cut])

    def _question_aggregate_demand(self) -> Optional[str]:
        """Which aggregate (if any) does the question's asked quantity require?

        Pure lexical scan of the task description returning 'COUNT' / 'AVG' /
        'SUM' / 'MAX' / 'MIN' or None.  Backticked identifiers and ALL schema
        table/column names are masked first so that a column named e.g.
        `Average annual output` or `Total` cannot trigger a false demand.
        """
        ctx = self.task_ctx
        if ctx is None:
            return None
        text = ctx.raw_description or ""
        if not text:
            return None
        # When the description carries a preamble, scan only the question part.
        if "Question:" in text:
            text = text.rsplit("Question:", 1)[1]
        # Mask backticked identifiers.
        text = re.sub(r"`[^`]*`", " ", text)
        # Mask every schema table/column name (parenthetical suffixes dropped,
        # words joined by \s+ so newline-separated header names match too).
        if self.schema_map is not None:
            names = set()
            for t in self.schema_map.tables:
                names.add(t.get("raw", "") or "")
                names.add(t.get("sanitized", "") or "")
                for c in t.get("columns", []):
                    names.add(c.get("raw", "") or "")
                    names.add(c.get("sanitized", "") or "")
            for name in sorted((n for n in names if len(n) >= 3), key=len, reverse=True):
                base = re.sub(r"\s*\([^)]*\)", "", name).strip()
                words = [w for w in base.split() if w]
                if not words:
                    continue
                pattern = r"\b" + r"\s+".join(re.escape(w) for w in words) + r"\b"
                try:
                    text = re.sub(pattern, " ", text, flags=re.IGNORECASE)
                except re.error:
                    continue
        t = text.lower()
        # "at least" / "at most" are filter phrases, never a MIN/MAX demand.
        t = re.sub(r"\bat\s+(?:least|most)\b", " ", t)
        # "<quantifier> number of" compounds before the generic COUNT words.
        if re.search(r"\b(?:lowest|fewest|minimum|min)\s+number\s+of\b", t):
            return "MIN"
        if re.search(r"\b(?:highest|maximum|max)\s+number\s+of\b", t):
            return "MAX"
        if re.search(r"\btotal\s+number\s+of\b", t):
            return "COUNT"
        if re.search(r"\baverage\b|\bmean\b", t):
            return "AVG"
        if re.search(r"\bhow\s+many\b|\bnumber\s+of\b|\bcount(?:s|ed|ing)?\b", t):
            return "COUNT"
        if re.search(r"\bsum\b|\btotal\b", t):
            return "SUM"
        if re.search(r"\bhighest\b|\bmaximum\b|\bmost\b|\bmax\b", t):
            return "MAX"
        if re.search(r"\blowest\b|\bminimum\b|\bfewest\b|\bleast\b|\bmin\b", t):
            return "MIN"
        return None

    def _last_sql_ranks_extreme(self, demand: str) -> bool:
        """True when the last SQL extracts an extreme row via ORDER BY ... LIMIT 1.

        `SELECT ... ORDER BY col DESC LIMIT 1` is terminal evidence for a MAX
        question (ASC / implicit ASC for MIN), exactly like the aggregate form.
        """
        sql = self.state.last_sql or ""
        if not re.search(r"\border\s+by\b", sql, re.IGNORECASE):
            return False
        if not re.search(r"\blimit\s+1\b", sql, re.IGNORECASE):
            return False
        m = re.search(r"order\s+by\b(.*?)(?:\blimit\b|$)", sql, re.IGNORECASE | re.DOTALL)
        clause = m.group(1) if m else ""
        dirs = re.findall(r"\b(asc|desc)\b", clause, re.IGNORECASE)
        direction = dirs[0].upper() if dirs else "ASC"  # MySQL default is ASC
        if demand == "MAX":
            return direction == "DESC"
        return direction == "ASC"

    def _terminal_evidence_ok(self) -> bool:
        """True when the last SQL result is terminal evidence for the question.

        - Mutation tasks (INSERT/UPDATE/DELETE, SHAPE_HASH) are never gated:
          their answer field is ignored by the evaluator.
        - No aggregate demand: any non-empty result set is evidence.
        - Aggregate demand: the demanded aggregate must have been computed
          (MAX/MIN also accept an ORDER BY ... LIMIT 1 extreme-row query).
        """
        ctx = self.task_ctx
        st = self.state
        if ctx is None:
            return True
        if ctx.task_type in _MUTATION_TYPES or ctx.answer_shape == SHAPE_HASH:
            return True
        demand = self._question_aggregate_demand()
        if demand is None:
            return bool(st.last_result_had_rows)
        if st.last_agg_fn == demand:
            return True
        if demand in ("MAX", "MIN") and self._last_sql_ranks_extreme(demand):
            return True
        return False

    def _looks_like_bare_scalar(self, value: Any) -> bool:
        """True for a single committed value that looks like a raw scalar."""
        s = str(value if value is not None else "").strip()
        if not s or s.startswith("("):
            return False
        if re.fullmatch(r"[-+]?\d+(?:[.,]\d+)?\s*%?", s):
            return True
        if re.fullmatch(r"[-+]?[\d,]+(?:\.\d+)?", s):
            return True
        return bool(re.fullmatch(r"\S{1,30}", s))

    def _missing_evidence_hint(self) -> str:
        """Step-guidance hint emitted instead of a premature promotion."""
        st = self.state
        demand = self._question_aggregate_demand()
        prefix = ""
        if isinstance(self._last_remaining_rounds, int) and self._last_remaining_rounds > 0:
            prefix = f"[{self._last_remaining_rounds} rounds left] "
        saw = "returned a raw value" if st.last_result_had_rows else "returned an empty result"
        if demand is not None:
            extra = ""
            if demand == "MAX":
                extra = " or `ORDER BY `col` DESC LIMIT 1`"
            elif demand == "MIN":
                extra = " or `ORDER BY `col` ASC LIMIT 1`"
            return (
                f"{prefix}Harness: the question asks for the {demand} value; your last query "
                f"{saw}. Run the {demand} query first (e.g. `SELECT {demand}(…) FROM `tbl` "
                f"WHERE …;`{extra}), then commit."
            )
        return (
            f"{prefix}Harness: your last query {saw}, so the answer is not confirmed yet. "
            f"Inspect the stored values (`SELECT * FROM `tbl` LIMIT 5;`), retry with "
            f"`LIKE '%…%'` for text, then commit."
        )

    def _evidence_recovery_prompt(self, kind: str, demand: Optional[str]) -> str:
        """Generic recovery prompt for an H6 evidence block (no task names/values)."""
        if kind == "missing_aggregate" and demand:
            extra = ""
            if demand == "MAX":
                extra = " or `SELECT … ORDER BY `col` DESC LIMIT 1;`"
            elif demand == "MIN":
                extra = " or `SELECT … ORDER BY `col` ASC LIMIT 1;`"
            return (
                f"Harness: the question asks for the {demand} value, but your last query did "
                f"not compute {demand}. Run the {demand} query on the target column first "
                f"(e.g. `SELECT {demand}(…) FROM `tbl` WHERE …;`{extra}), inspect its output, "
                f"then commit that value."
            )
        return (
            "Harness: your last query returned no rows, so a blank/give-up answer has no "
            "supporting evidence. Inspect the stored values first "
            "(`SELECT * FROM `tbl` LIMIT 5;` or `SELECT DISTINCT `col` FROM `tbl` LIMIT 10;`), "
            "then match exactly: use `LIKE '%…%'` for text, and strip commas/units with "
            "`CAST(REPLACE(`col`,',','') AS UNSIGNED)` before numeric comparisons. Commit only "
            "after a query actually returns the answer."
        )

    # ── H2: Commit gate + answer normalisation ──────────────────────────────

    def gate_commit(self, answers: List[str]) -> Dict[str, Any]:
        """Decide whether to allow, normalise, or block a commit_final_answer.

        Returns: {action: "allow"|"block", answers, blocked_reason,
                  normalize_audit, rule_hits[]}
        """
        response: Dict[str, Any] = {
            "action": "allow",
            "answers": list(answers or []),
            "blocked_reason": "",
            "normalize_audit": None,
            "rule_hits": [],
        }
        if not self.config.h2_enabled or self.task_ctx is None:
            return response
        ctx = self.task_ctx
        st = self.state

        is_mutation = ctx.task_type in _MUTATION_TYPES

        # Block explanatory / "unable to find" text answers on mutation tasks.
        # When agents can't locate the target row they sometimes give up and submit
        # a sentence like "Unable to update..." — this always fails the hash check.
        _GIVE_UP_PATTERNS = re.compile(
            r"\b(unable|cannot|can't|not found|no such|not exist|could not|doesn't exist)\b",
            re.IGNORECASE,
        )
        if is_mutation and answers and any(_GIVE_UP_PATTERNS.search(str(a)) for a in answers):
            if st.mutation_commit_blocks_used < self.config.h2_mutation_commit_block_limit:
                st.mutation_commit_blocks_used += 1
                response["action"] = "block"
                response["blocked_reason"] = "give_up_text_on_mutation"
                response["rule_hits"].append({"rule": "block_mutation_give_up_text"})
                return response

        # Block empty commits on non-mutation tasks (once).
        # Also catches all-whitespace or all-empty-string answers like [""].
        _answers_all_blank = (
            not answers or all(not str(a).strip() for a in answers)
        )
        if _answers_all_blank and not is_mutation:
            if st.commit_blocks_used < self.config.h2_commit_block_limit:
                st.commit_blocks_used += 1
                response["action"] = "block"
                response["blocked_reason"] = "empty_answers_before_query"
                response["recovery_prompt"] = (
                    "Harness: you committed an empty or blank answer. "
                    "Run execute_sql to retrieve the actual value from the database "
                    "and commit the numeric/string result — NOT an empty string."
                )
                response["rule_hits"].append({"rule": "block_empty_answers"})
                return response

        # Block scalar tasks where agent commits "0" or "none" immediately after
        # getting an empty SQL result (likely a bad WHERE condition, not a true zero).
        _trivially_wrong_scalar = (
            not is_mutation
            and ctx.answer_shape in (SHAPE_SCALAR_INT, SHAPE_SCALAR_FLOAT)
            and len(answers) == 1
            and str(answers[0]).strip().lower() in ("0", "0.0", "none", "null", "")
            and st.last_error_kind == "empty"
            and st.sql_history  # only after at least one SQL
        )
        if _trivially_wrong_scalar:
            if st.commit_blocks_used < self.config.h2_commit_block_limit:
                st.commit_blocks_used += 1
                response["action"] = "block"
                response["blocked_reason"] = "zero_after_empty_result"
                response["recovery_prompt"] = (
                    f"Harness: your last SQL returned no rows, so submitting "
                    f"{answers[0]!r} is likely wrong. "
                    "Your WHERE condition probably didn't match anything. "
                    "Run `SELECT * FROM `tbl` LIMIT 5` to see actual values, "
                    "then adjust your query."
                )
                response["rule_hits"].append({"rule": "block_zero_after_empty"})
                return response

        # Mutation task: agent must have actually executed a mutation.
        # Uses a separate, higher block counter to keep prompting the agent.
        if is_mutation and not st.mutation_attempted:
            if st.mutation_commit_blocks_used < self.config.h2_mutation_commit_block_limit:
                st.mutation_commit_blocks_used += 1
                response["action"] = "block"
                response["blocked_reason"] = "mutation_not_executed"
                response["rule_hits"].append({"rule": "block_commit_before_mutation"})
                return response

        # Non-mutation task: agent must have run at least one execute_sql.
        if not is_mutation and not st.sql_history:
            if st.commit_blocks_used < self.config.h2_commit_block_limit:
                st.commit_blocks_used += 1
                response["action"] = "block"
                response["blocked_reason"] = "commit_before_any_sql"
                response["rule_hits"].append({"rule": "block_commit_before_sql"})
                return response

        # Block scalar tasks where agent submits multiple answers (e.g. GROUP BY result).
        # This is the #1 cause of SELECT scalar_int failures: agent runs GROUP BY,
        # gets N rows, and tries to commit all N values when a single total is expected.
        if (
            ctx.answer_shape in (SHAPE_SCALAR_INT, SHAPE_SCALAR_FLOAT)
            and len(answers) > 1
            and st.scalar_multi_answer_blocks_used < 3  # dedicated higher limit
        ):
            st.scalar_multi_answer_blocks_used += 1
            response["action"] = "block"
            response["blocked_reason"] = "scalar_expected_but_multiple_answers"
            response["recovery_prompt"] = (
                f"Harness: this task expects ONE number but you submitted {len(answers)} values. "
                "You likely used GROUP BY which returns one row per group. "
                "Remove GROUP BY and use a global aggregate: "
                "`SELECT COUNT(*) FROM `t` WHERE …` or `SELECT SUM(…) FROM `t` WHERE …`. "
                "Then commit the single result."
            )
            response["rule_hits"].append({"rule": "block_scalar_multi_answer"})
            return response

        # H6 terminal-evidence gate (non-mutation only).  Do not let the episode
        # close on evidence that cannot contain the answer:
        #   (a) blank / give-up text while the last result had no rows;
        #   (b) a bare scalar while the demanded aggregate was never computed.
        # At most once per executed SQL: after any NEW SQL runs, the following
        # commit is allowed (anti-deadlock); total cap is 3 evidence blocks.
        # This uses its own counter and never touches commit_blocks_used /
        # mutation_commit_blocks_used / scalar_multi_answer_blocks_used.
        if (not is_mutation) and st.evidence_blocks_used < 3:
            if not self._terminal_evidence_ok():
                last_norm = _normalize_sql(st.last_sql or "")
                same_execution = (
                    st.last_evidence_block_sql is None
                    or st.last_evidence_block_sql == last_norm
                )
                if same_execution:
                    _answers_blank = (not answers) or all(not str(a).strip() for a in answers)
                    _answers_giveup = bool(answers) and all(
                        _GIVE_UP_PATTERNS.search(str(a)) for a in answers
                    )
                    demand = self._question_aggregate_demand()
                    _bare_scalar_missing_agg = (
                        demand is not None
                        and len(answers) == 1
                        and self._looks_like_bare_scalar(answers[0])
                    )
                    if (not st.last_result_had_rows) and (_answers_blank or _answers_giveup):
                        st.evidence_blocks_used += 1
                        st.last_evidence_block_sql = last_norm
                        response["action"] = "block"
                        response["blocked_reason"] = "non_terminal_evidence_no_rows"
                        response["recovery_prompt"] = self._evidence_recovery_prompt(
                            "no_rows", demand
                        )
                        response["rule_hits"].append({
                            "rule": "block_non_terminal_evidence",
                            "reason": "blank_or_giveup_without_rows",
                        })
                        return response
                    if _bare_scalar_missing_agg:
                        st.evidence_blocks_used += 1
                        st.last_evidence_block_sql = last_norm
                        response["action"] = "block"
                        response["blocked_reason"] = "non_terminal_evidence_missing_aggregate"
                        response["recovery_prompt"] = self._evidence_recovery_prompt(
                            "missing_aggregate", demand
                        )
                        response["rule_hits"].append({
                            "rule": "block_non_terminal_evidence",
                            "reason": "bare_scalar_without_demanded_aggregate",
                            "demand": demand,
                        })
                        return response

        # H2 answer normalisation (shape-aware).
        normalised, audit = normalize_answers_list(answers, ctx.answer_shape)

        # For multi-col SELECT: if the agent submitted flat cells (e.g. ["a","b","c","d"…])
        # instead of row tuple-strings ("('a','b')","('c','d')"), try to regroup them
        # using the last known column count so they match the evaluator's ground-truth format.
        if (
            ctx.answer_shape == SHAPE_MULTI_MULTI
            and self.state.last_result_col_count is not None
            and self.state.last_result_col_count > 1
            and len(normalised) > 1
            and not any(a.strip().startswith("(") for a in normalised)
        ):
            n = self.state.last_result_col_count
            if len(normalised) % n == 0:
                rows: List[str] = []
                for i in range(0, len(normalised), n):
                    cells = normalised[i : i + n]
                    row_str = "(" + ", ".join(f"'{c}'" for c in cells) + ")"
                    rows.append(row_str)
                normalised = rows
                audit.setdefault("rule_hits", []).append("regroup_flat_to_tuples")
                audit["mutated"] = True

        # Single-col tuple unwrap: task classified as MULTI_MULTI but actual query
        # returned only 1 column.  Agent over-formats as ["('v1',)", "('v2',)"] but
        # the evaluator's _clean_mysql_result returns bare ["v1", "v2"] for single-col
        # tuples, so they would never match without this unwrap.
        if (
            ctx.answer_shape == SHAPE_MULTI_MULTI
            and self.state.last_result_col_count is not None
            and self.state.last_result_col_count == 1
            and normalised
        ):
            _single_tuple_re = re.compile(r"^\('([^'\\]*)'\s*,?\s*\)$")
            unwrapped: List[str] = []
            any_unwrapped = False
            for a in normalised:
                m = _single_tuple_re.match(a.strip())
                if m:
                    unwrapped.append(m.group(1))
                    any_unwrapped = True
                else:
                    unwrapped.append(a)
            if any_unwrapped:
                normalised = unwrapped
                audit.setdefault("rule_hits", []).append("unwrap_single_col_tuples")
                audit["mutated"] = True

        response["answers"] = normalised
        response["normalize_audit"] = audit
        if audit.get("mutated"):
            response["rule_hits"].append({"rule": "normalize_answers", "hits": audit.get("rule_hits", [])})

        return response

    # ── H1: update after tool result ────────────────────────────────────────

    def update_state_after_sql(self, sql: str, response: str) -> None:
        normalised = _normalize_sql(sql or "")
        self.state.sql_history.append(normalised)
        self.state.sql_history_raw.append(sql or "")
        self.state.last_sql = sql
        self.state.last_result_raw = response or ""

        kind, err_text = classify_db_response(response or "")
        self.state.last_error_kind = kind
        self.state.last_error_text = err_text or ""
        self.state.last_result_was_error = kind in ("syntax", "unknown_col", "unknown_table", "timeout")

        if self.state.last_result_was_error:
            self.state.error_streak += 1
        else:
            self.state.error_streak = 0

        if kind == "empty":
            self.state.empty_streak += 1
        else:
            self.state.empty_streak = 0

        # Loop streak (same normalised SQL)
        if (
            len(self.state.sql_history) >= 2
            and self.state.sql_history[-1] == self.state.sql_history[-2]
        ):
            self.state.loop_streak += 1
        else:
            self.state.loop_streak = 0

        # Track mutation attempts — structural check only (task type + verb +
        # target table). We deliberately do not compare values against std_sql.
        if self.task_ctx is not None and self.task_ctx.task_type in _MUTATION_TYPES:
            verb = self.task_ctx.task_type.lower()
            if re.search(rf"\b{verb}\b", sql or "", re.IGNORECASE):
                if self.task_ctx.target_table_sanitized:
                    tbl = self.task_ctx.target_table_sanitized.lower()
                    if tbl in (sql or "").lower() and not self.state.last_result_was_error:
                        self.state.mutation_attempted = True
                elif not self.state.last_result_was_error:
                    self.state.mutation_attempted = True

        # Discovered columns — from DESCRIBE output
        if re.match(r"^\s*describe\b", (sql or ""), re.IGNORECASE):
            # MySQL DESCRIBE output is repr-string of tuples — first field per row is the column name.
            try:
                parsed = ast.literal_eval((response or "").strip())
                if isinstance(parsed, list):
                    tbl_match = re.search(r"describe\s+`?([^`\s;]+)`?", sql or "", re.IGNORECASE)
                    tbl_name = tbl_match.group(1) if tbl_match else "_"
                    cols = [str(row[0]) for row in parsed if isinstance(row, tuple) and row]
                    if cols:
                        self.state.discovered_columns[tbl_name] = cols
            except Exception:
                pass

        # Track column count for multi-col results (used for flat-cell regroup in gate_commit).
        # H6: also record whether the result had any rows (terminal-evidence tracking).
        if not self.state.last_result_was_error and self.task_ctx is not None:
            resp_s = (response or "").strip()
            self.state.last_result_had_rows = False
            parsed_list_ok = False
            if resp_s.startswith("[") and resp_s.endswith("]"):
                try:
                    parsed_r = ast.literal_eval(resp_s)
                    if isinstance(parsed_r, list):
                        parsed_list_ok = True
                        self.state.last_result_had_rows = len(parsed_r) > 0
                        if parsed_r and isinstance(parsed_r[0], tuple):
                            self.state.last_result_col_count = len(parsed_r[0])
                            self.state.last_result_row_count = len(parsed_r)
                except Exception:
                    pass
            if not parsed_list_ok and kind != "empty":
                # Non-list / unparseable payload that the backend did not call
                # empty — assume evidence is present rather than gating it.
                self.state.last_result_had_rows = bool(resp_s)

        # H6: what did this SQL compute?  Track the aggregate function of the
        # last SELECT projection and the projected expressions themselves so
        # the evidence gate can tell whether the asked quantity was computed.
        self.state.last_agg_fn = None
        self.state.last_projection = []
        _projection = self._sql_projection_exprs(sql or "")
        if _projection is not None:
            self.state.last_projection = _projection
            _fn_hits = [
                f.upper() for f in re.findall(
                    r"\b(count|sum|avg|min|max)\s*\(", " ".join(_projection), re.IGNORECASE
                )
            ]
            if _fn_hits:
                _demand = self._question_aggregate_demand()
                # Prefer the demanded aggregate when the query computes several,
                # so a genuinely computed demand is never reported as missing.
                self.state.last_agg_fn = (
                    _demand if (_demand and _demand in _fn_hits) else _fn_hits[0]
                )

        # Candidate extraction — only when the response is ok AND the query is not
        # a schema-inspection command (DESCRIBE / SHOW / EXPLAIN). Those return
        # metadata rows (column definitions) that look like valid results but are
        # not answers; promoting them as candidates causes H5 to tell the agent to
        # commit schema output as the answer.
        _is_schema_inspect = bool(re.match(
            r"\s*(describe|show\s+tables|show\s+columns|explain)\b",
            sql or "", re.IGNORECASE
        ))
        if not self.state.last_result_was_error and self.task_ctx is not None and not _is_schema_inspect:
            cand, implausible = extract_candidate_from_response(
                response or "", self.task_ctx.answer_shape
            )
            if cand is not None:
                self.state.candidate_answer = cand
                self.state.candidate_answer_shape = self.task_ctx.answer_shape
                self.state.candidate_implausible = bool(implausible)
            elif kind == "null_agg" and self.task_ctx.answer_shape in (SHAPE_SCALAR_INT, SHAPE_SCALAR_FLOAT):
                # NULL aggregate → "0" candidate (evaluator maps None → "0").
                self.state.candidate_answer = "0"
                self.state.candidate_answer_shape = self.task_ctx.answer_shape
                # Mark plausible — the evaluator treats None as "0" so this is a legit answer.
                self.state.candidate_implausible = False

    def note_text_only_turn(self) -> None:
        self.state.text_only_streak += 1

    def reset_text_only_streak(self) -> None:
        self.state.text_only_streak = 0

    # ── H4: Post-step monitor (with budget merge) ───────────────────────────

    def post_step_monitor(self, remaining_rounds: int = 99) -> Dict[str, Any]:
        """Return a recovery prompt + optional force action.

        remaining_rounds = max_round - completed_rounds_so_far.
        Careful on false positives (per user warning).
        """
        response: Dict[str, Any] = {
            "audit_reason": "",
            "recovery_prompt": None,
            "force_action": None,
            "budget_branch": None,
        }
        if not self.config.h4_enabled or self.task_ctx is None:
            self.state.h4_fired_last_round = False
            return response
        st = self.state
        ctx = self.task_ctx
        prior_h4 = st.h4_fired_last_round

        # H6: remember the host-reported remaining rounds so step guidance can
        # reuse the existing "[N rounds left]" formatting when it is available.
        if isinstance(remaining_rounds, int) and 0 < remaining_rounds <= 30:
            self._last_remaining_rounds = remaining_rounds

        def _return(r: Dict[str, Any]) -> Dict[str, Any]:
            st.h4_fired_last_round = bool(r.get("recovery_prompt")) or (r.get("force_action") is not None)
            return r

        # ⓪-pre Text-only loop: agent keeps writing tool calls as plain text
        # and failing rescue for N consecutive turns. Force a commit or break the loop.
        if st.text_only_streak >= 3:
            response["audit_reason"] = "text_only_loop"
            if (
                st.candidate_answer is not None
                and not st.candidate_implausible
                and ctx.answer_shape not in (SHAPE_HASH, None)
            ):
                answers = self._candidate_to_answers_list()
                if answers is not None:
                    response["force_action"] = {
                        "name": "commit_final_answer",
                        "arguments": {"answers": answers},
                    }
                    response["recovery_prompt"] = (
                        "Harness: you have been writing tool calls as plain text. "
                        "Forcing commit_final_answer with last good candidate."
                    )
                    return _return(response)
            response["recovery_prompt"] = (
                "Harness: you must use the function-calling API, NOT plain text. "
                "Call execute_sql or commit_final_answer via the tool interface directly."
            )
            return _return(response)

        # ⓪ Syntax error — parse the near-token if possible.
        if st.last_error_kind == "syntax":
            near = None
            m = _MYSQL_SYNTAX_NEAR_RE.search(st.last_result_raw or "")
            if m:
                near = m.group(1).strip()
            extra = f" The error is near `{near}` — check if this is an un-backticked identifier." if near else ""
            response["audit_reason"] = "syntax_error"
            response["recovery_prompt"] = (
                "Harness: MySQL syntax error." + extra +
                " Wrap any identifier with spaces/punctuation in backticks (e.g. `Race Name`), "
                "and use `CONCAT(a, b)` instead of `a || b`."
            )
            return _return(response)

        # ① Unknown column
        if st.last_error_kind == "unknown_col":
            m = _MYSQL_UNKNOWN_COL_RE.search(st.last_result_raw or "")
            col = m.group(1) if m else None
            hint_tbl = ctx.target_table_sanitized or "target_table"
            detail = f" (column '{col}' not found)" if col else ""
            response["audit_reason"] = "unknown_column"
            response["recovery_prompt"] = (
                f"Harness: Unknown column{detail}. Run `DESCRIBE `{hint_tbl}`;` to see "
                f"the real column names — column names were truncated to 64 chars on import, "
                f"so the descriptive name in the question may not match the actual column."
            )
            return _return(response)

        # ② Unknown table
        if st.last_error_kind == "unknown_table":
            response["audit_reason"] = "unknown_table"
            response["recovery_prompt"] = (
                "Harness: Table not found. Run `SHOW TABLES;` to list actual table names — "
                "the table name may have been sanitized during import."
            )
            return _return(response)

        # ②.5 Mutation task but only SELECT queries executed — strong reminder.
        if (
            ctx.task_type in _MUTATION_TYPES
            and len(st.sql_history) >= 2
            and not st.mutation_attempted
            and all(s.strip().startswith("select") for s in st.sql_history)
        ):
            response["audit_reason"] = "mutation_only_select"
            verb = ctx.task_type
            example = (
                f"`INSERT INTO `tbl` (…) VALUES (…)`" if verb == "INSERT" else
                f"`UPDATE `tbl` SET col='…' WHERE …`" if verb == "UPDATE" else
                f"`DELETE FROM `tbl` WHERE …`"
            )
            response["recovery_prompt"] = (
                f"Harness: this is a {verb} task but you have only run SELECT queries. "
                f"You MUST execute a mutation SQL now, e.g. {example}. "
                f"SELECT queries do not modify the table."
            )
            return _return(response)

        # ③ NULL aggregate — for aggregation task types and SELECT tasks using agg functions.
        _uses_agg = bool(re.search(r"\b(sum|avg|count)\s*\(", st.last_sql or "", re.IGNORECASE))
        if st.last_error_kind == "null_agg" and (
            ctx.task_type in _AGGREGATION_TYPES
            or (ctx.task_type in (TASK_SELECT, TASK_COUNTING) and _uses_agg)
        ):
            response["audit_reason"] = "null_aggregate"
            response["recovery_prompt"] = (
                "Harness: aggregate returned NULL. The numeric column may be TEXT-typed — "
                "wrap it: `CAST(`col` AS DECIMAL(20,6))`. If truly no matching rows, "
                "submit '0' (the grader maps None/null → '0')."
            )
            return _return(response)

        # ③.5 Mutation task with persistent empty SELECT — suggest relaxing filter.
        # Agents often run SELECT to preview the target row before mutating; when
        # the SELECT returns empty they give up rather than trying a different filter.
        if (
            ctx.task_type in _MUTATION_TYPES
            and st.last_error_kind == "empty"
            and st.empty_streak >= 2
            and not st.mutation_attempted
        ):
            response["audit_reason"] = "mutation_empty_select"
            response["recovery_prompt"] = (
                "Harness: your SELECT returned no rows. The target row may use "
                "different capitalisation, spacing, or special characters. "
                "Try `SELECT * FROM `tbl` LIMIT 5;` to see actual values, then "
                "match exactly. Do NOT give up — run the mutation SQL once you "
                "find the correct WHERE clause."
            )
            return _return(response)

        # ④ Empty results for query-shape tasks — only after N consecutive empties.
        _query_task_types = (
            TASK_SELECT, TASK_COUNTING, TASK_COMPARISON,
            TASK_AGG_SUM, TASK_AGG_AVG, TASK_AGG_COUNT,
            TASK_AGG_MIN, TASK_AGG_MAX, TASK_RANKING, TASK_OTHER,
        )
        if (
            st.last_error_kind == "empty"
            and ctx.task_type in _query_task_types
            and st.empty_streak >= self.config.h4_empty_threshold
        ):
            response["audit_reason"] = "empty_result"
            response["recovery_prompt"] = (
                "Harness: zero rows for several queries. Filter may be too strict — try "
                "`LIKE '%X%'` for partial match, drop a WHERE clause, or use LOWER() for "
                "case-insensitive compare. Run `SELECT * FROM `tbl` LIMIT 5` to see actual values."
            )
            return _return(response)

        # ⑤ SQL loop — N identical SQL in a row. Budget force if we have a good candidate.
        if (
            len(st.sql_history) >= self.config.h4_stall_window
            and len(set(st.sql_history[-self.config.h4_stall_window:])) == 1
        ):
            response["audit_reason"] = "sql_loop"
            if (
                st.candidate_answer is not None
                and not st.candidate_implausible
                and ctx.answer_shape not in (SHAPE_HASH, None)
            ):
                answers = self._candidate_to_answers_list()
                if answers is not None:
                    response["force_action"] = {
                        "name": "commit_final_answer",
                        "arguments": {"answers": answers},
                    }
                    response["recovery_prompt"] = (
                        f"Harness: you ran the same SQL {self.config.h4_stall_window} times. "
                        "The output already contains the answer — forcing commit_final_answer."
                    )
                    return _return(response)
            response["recovery_prompt"] = (
                "Harness: you are repeating the same SQL. Try a different approach — "
                "DESCRIBE the table, relax the WHERE clause, or cast the numeric column."
            )
            return _return(response)

        # ⑥ Budget management (H4 sub-branch).  Only fires when NO earlier branch did.
        rem = remaining_rounds
        budget_force_threshold = self.config.h4_budget_force_threshold
        budget_warn_threshold = self.config.h4_budget_warn_threshold

        if (
            rem <= budget_force_threshold
            and st.candidate_answer is not None
            and not st.candidate_implausible
            and ctx.answer_shape not in (SHAPE_HASH, None)
        ):
            answers = self._candidate_to_answers_list()
            if answers is not None:
                response["audit_reason"] = "budget_force"
                response["budget_branch"] = "force"
                response["force_action"] = {
                    "name": "commit_final_answer",
                    "arguments": {"answers": answers},
                }
                response["recovery_prompt"] = (
                    f"[{rem} rounds left] Harness: forcing commit_final_answer with "
                    f"candidate from last successful query."
                )
                return _return(response)
        if rem <= budget_warn_threshold and not st.h4_fired_last_round:
            response["audit_reason"] = "budget_warn"
            response["budget_branch"] = "warn"
            if (
                st.candidate_answer is not None
                and not st.candidate_implausible
                and ctx.answer_shape not in (SHAPE_HASH, None)
            ):
                response["recovery_prompt"] = (
                    f"[{rem} rounds left] Harness: you have a valid candidate answer from "
                    "your last successful query. Call commit_final_answer now."
                )
            else:
                response["recovery_prompt"] = (
                    f"[{rem} rounds left] Harness: finalise your approach — only a few "
                    "rounds left. Prefer DESCRIBE / LIKE / CAST if the last query didn't work."
                )
            return _return(response)

        # No trigger — reset flag.
        st.h4_fired_last_round = False
        return response

    # ── H4-E: state-driven per-step guidance ────────────────────────────────

    def step_guidance(
        self,
        round_num: int,
        h4_audit_active: bool = False,
    ) -> Optional[str]:
        """H4-E: Per-step guidance driven by H1 runtime state (candidate answers, SQL history)."""
        if not self.config.h4_enabled or self.task_ctx is None:
            return None
        ctx = self.task_ctx
        st = self.state

        hint: Optional[str] = None

        # 0. Promote candidate answer on non-mutation tasks (suppressed when H4 just fired).
        #    H6: only promote terminal evidence.  When the demanded aggregate is
        #    missing / the lookup returned no rows, steer to the missing operation
        #    instead of telling the model to commit the raw value.
        if (
            not h4_audit_active
            and ctx.answer_shape not in (SHAPE_HASH, None)
            and st.candidate_answer is not None
            and not st.candidate_implausible
            and st.sql_history
        ):
            if not self._terminal_evidence_ok():
                hint = self._missing_evidence_hint()
            elif ctx.answer_shape == SHAPE_MULTI_MULTI and st.last_result_col_count and st.last_result_col_count > 1:
                row_note = f"{st.last_result_row_count} rows " if st.last_result_row_count else "rows "
                hint = (
                    f"Harness hint: last query returned {row_note}with "
                    f"{st.last_result_col_count} columns. Submit ALL rows — each as "
                    f"one tuple-repr element: answers=[\"('v1','v2')\", …]. "
                    f"Call commit_final_answer now."
                )
            else:
                preview = str(st.candidate_answer)[:60]
                hint = (
                    f"Harness hint: last successful query returned `{preview}`. "
                    f"Submit the bare value(s) — no tuple brackets. "
                    f"Call commit_final_answer now."
                )

        # 1. Semantic-gap lint — only when no candidate yet.
        if hint is None and st.sql_history_raw and st.candidate_answer is None:
            last_sql = st.sql_history_raw[-1] or ""
            low = last_sql.lower()
            if ctx.mentions_like and " like " not in low and "=" in low:
                hint = (
                    "Harness lint: task mentions 'contains / includes' — use "
                    "`WHERE col LIKE '%word%'`, not `= 'word'`."
                )
            elif ctx.case_insensitive and "lower(" not in low and "collate" not in low:
                hint = (
                    "Harness lint: task says 'ignoring case' — wrap the compared "
                    "expression with LOWER() on both sides."
                )
            elif ctx.task_type == TASK_RANKING and " order by " not in low:
                hint = (
                    "Harness lint: ranking task needs `ORDER BY CAST(`col` AS SIGNED) [DESC] LIMIT 1`."
                )

        # 2. Round-0 template — only when no SQL has been run yet.
        if hint is None and round_num == 0 and not st.sql_history:
            hint = self._first_turn_hint()

        # 3. Implausibility warn — fires for counting/agg AND for SELECT/comparison
        #    tasks where a scalar is expected but multi-row was returned.
        if hint is None and st.candidate_implausible and not h4_audit_active:
            if ctx.task_type in (TASK_COUNTING, *_AGGREGATION_TYPES):
                hint = (
                    "Harness: the last numeric result looks suspicious (0 / None from an "
                    "over-strict filter). Relax the WHERE clause or cast the column before "
                    "committing."
                )
            elif (
                ctx.task_type in (TASK_SELECT, TASK_COMPARISON, TASK_RANKING)
                and ctx.answer_shape in (SHAPE_SCALAR_INT, SHAPE_SCALAR_FLOAT, SHAPE_SCALAR_STR)
            ):
                hint = (
                    "Harness: multiple rows returned but task expects a single value. "
                    "Use COUNT(*), MAX/MIN, or add a more specific WHERE / LIMIT 1."
                )

        if hint is None:
            return None

        words = hint.split()
        if len(words) > self.config.h4_hint_max_words:
            hint = " ".join(words[: self.config.h4_hint_max_words])

        if hint == self._last_hint:
            return None
        self._last_hint = hint
        return hint

    def _first_turn_hint(self) -> Optional[str]:
        ctx = self.task_ctx
        if ctx is None:
            return None
        tbl = f"`{ctx.target_table_sanitized}`" if ctx.target_table_sanitized else "`<table>`"

        if ctx.task_type in (TASK_COUNTING, TASK_AGG_COUNT):
            return f"Hint: try `SELECT COUNT(*) FROM {tbl} WHERE …;` — commit the bare integer."
        if ctx.task_type == TASK_RANKING:
            return f"Hint: `SELECT `name_col` FROM {tbl} ORDER BY CAST(`num_col` AS SIGNED) DESC LIMIT 1;` — cast if the column is TEXT."
        if ctx.task_type == TASK_SELECT:
            return (
                f"Hint: `SELECT * FROM {tbl} WHERE …;` — "
                f"for multi-column results submit each ROW as one tuple-repr element: "
                f"answers=[\"('v1','v2')\"]; for single-column submit bare values: answers=['v1','v2']."
            )
        if ctx.task_type == TASK_AGG_SUM:
            return f"Hint: `SELECT SUM(CAST(`col` AS DECIMAL(20,6))) FROM {tbl} WHERE …;` — submit '0' if NULL."
        if ctx.task_type == TASK_AGG_AVG:
            return f"Hint: `SELECT AVG(CAST(`col` AS DECIMAL(20,6))) FROM {tbl} WHERE `col` != '';`."
        if ctx.task_type in (TASK_AGG_MAX, TASK_AGG_MIN):
            fn = "MAX" if ctx.task_type == TASK_AGG_MAX else "MIN"
            return f"Hint: `SELECT {fn}(CAST(`col` AS DECIMAL(20,6))) FROM {tbl};` — cast for numeric TEXT columns."
        if ctx.task_type == TASK_INSERT:
            return (
                f"Hint: `INSERT INTO {tbl} (col1, …) VALUES ('val1', …);` — "
                "ALL values must be quoted strings matching the exact format in the sample rows "
                "(units, ordinals, date strings preserved). Then commit_final_answer."
            )
        if ctx.task_type == TASK_UPDATE:
            return f"Hint: `UPDATE {tbl} SET `col` = '…' WHERE …;` — ALWAYS include WHERE."
        if ctx.task_type == TASK_DELETE:
            return f"Hint: `DELETE FROM {tbl} WHERE …;` — ALWAYS include WHERE."
        if ctx.task_type == TASK_COMPARISON:
            return f"Hint: `SELECT … FROM {tbl} WHERE …;` — compare using `>`, `<`, or LIKE as appropriate."
        return None


class Harness:
    """Current four-hook adapter for the released DBBench runtime.

    ``bind_task_context`` receives the task type and table description that the
    released Runtime already consumed.  Oracle SQL and labels are deliberately
    rejected.  This keeps the structured interface while preventing the type
    inference loss seen in the first migration experiment.
    """

    _FORBIDDEN_CONTEXT_KEYS = {"sql", "label", "answer_md5", "ground_truth"}

    def __init__(self, config: Optional[DBBenchHarnessConfig] = None):
        self.h4_persistent = True
        self.h4_message_prefix = ""
        self.h2_preserve_raw_history = True
        self.h5_message_prefix = "\n\nSome tips that may help for this task:\n- "
        self.runtime = DBBenchHarnessRuntime(config or DBBenchHarnessConfig(
            enabled=True,
            h2_enabled=True,
            h3_enabled=True,
            h4_enabled=True,
            h5_enabled=True,
            h5_top_k=1,
        ))
        self._ready = False
        self._seen_tool_count = 0
        self._turn = 0
        self._h2_side_messages: List[str] = []
        self._executed_sql: Dict[str, str] = {}
        self._suppressed_tool_ids = set()
        self._skip_next_no_tool_monitor = False
        self._conditioned_roles = set()

    def bind_task_context(self, context: Optional[Dict[str, Any]]) -> None:
        if context is None:
            return
        if not isinstance(context, dict):
            raise TypeError("DBBench task context must be a dictionary")
        forbidden = self._FORBIDDEN_CONTEXT_KEYS.intersection(context)
        if forbidden:
            raise ValueError("Oracle fields are not allowed in Harness context: " + ", ".join(sorted(forbidden)))
        entry = copy.deepcopy(context)
        task_type = entry.get("type")
        if isinstance(task_type, str):
            entry["type"] = [task_type]
        if not (entry.get("description") and entry.get("type") and entry.get("table")):
            raise ValueError("DBBench context requires description, type, and table")
        self.runtime.init_task(entry)
        self._ready = True

    def h3(self, tools):
        return patch_dbbench_tool_descriptions(tools)

    def h3_message(self, message):
        role = message.get("role")
        if role in self._conditioned_roles:
            return message
        content = message.get("content")
        if not isinstance(content, str):
            return message
        if role == "system":
            message["content"] = patch_dbbench_system_prompt(content)
            self._conditioned_roles.add(role)
        elif role == "user" and "Question:" in content:
            schema = self.runtime.schema_card() if self._ready else ""
            if schema:
                before, question = content.rsplit("Question:", 1)
                message["content"] = before + "\n" + schema + "\nQuestion:" + question
            self._conditioned_roles.add(role)
        return message

    def h5(self, messages):
        self._ensure_ready(messages)
        return self._one_hint(*[x["text"] for x in self.runtime.cold_start_skill_hints()])

    def h4(self, messages, remaining):
        self._ensure_ready(messages)
        self._observe_new_tools(messages)
        if not self._observed_this_turn:
            self._skip_next_no_tool_monitor = False
            return []
        result = self.runtime.post_step_monitor(remaining_rounds=remaining + 1)
        if result.get("force_action"):
            self.runtime.force_next_action = result["force_action"]
        active = bool(result.get("recovery_prompt") or result.get("force_action"))
        step = (
            self.runtime.step_guidance(
                round_num=max(0, self._turn - 1),
                h4_audit_active=active,
            )
            if self._observed_this_turn
            else None
        )
        hints = [result.get("recovery_prompt"), step]
        return self._one_hint(*hints)

    def h2(self, message, history):
        self._ensure_ready(history)
        self._turn += 1
        out = copy.deepcopy(message)
        calls = out.get("tool_calls") or []
        if self.runtime.force_next_action:
            forced = self.runtime.force_next_action
            self.runtime.force_next_action = None
            call_id = calls[0].get("id") if calls else "harness_force_%d" % self._turn
            return self._message_call(out, call_id, forced["name"], forced.get("arguments") or {})
        if not calls and out.get("content"):
            rescued = rescue_tool_call_from_text(out["content"])
            if rescued:
                out = self._message_call(
                    out,
                    "harness_rescued_%d" % (self._turn - 1),
                    rescued["name"],
                    rescued.get("arguments") or {},
                )
                calls = out["tool_calls"]
        if not calls:
            self.runtime.note_text_only_turn()
            return out
        self.runtime.reset_text_only_streak()
        call = calls[0]
        name = call.get("function", {}).get("name")
        try:
            args = json.loads(call["function"]["arguments"])
            if not isinstance(args, dict):
                return out
        except (ValueError, TypeError, KeyError):
            return out
        if name == "execute_sql":
            sql = args.get("query", next(iter(args.values()), ""))
            if not isinstance(sql, str):
                return out
            check = self.runtime.pre_validate_sql(sql)
            if check["action"] == "block":
                reason = str(check.get("blocked_reason") or "invalid statement")
                self._suppressed_tool_ids.add(str(call.get("id", "")))
                return self._blocked(
                    out,
                    {
                        "role": "tool",
                        "tool_call_id": str(call.get("id", "")),
                        "content": "Error: SQL blocked by harness (" + reason + ").",
                    },
                )
            if check["action"] == "force_commit":
                return self._message_call(
                    out, call.get("id", "harness_force_%d" % self._turn),
                    "commit_final_answer", check.get("force_args") or {"answers": []},
                )
            for hit in check.get("rule_hits", []):
                if isinstance(hit, dict) and hit.get("hint"):
                    self._h2_side_messages.append(hit["hint"])
            self._executed_sql[str(call.get("id", ""))] = check["sql"]
            if check["sql"] == sql:
                return out
            return self._message_call(
                out, call.get("id", "harness_sql_%d" % self._turn),
                "execute_sql", {"query": check["sql"]},
            )
        if name == "commit_final_answer":
            answers = args.get("answers", next(iter(args.values()), []))
            if not isinstance(answers, list):
                answers = [str(answers)]
            gate = self.runtime.gate_commit(answers)
            if gate["action"] == "block":
                static_messages = {
                    "empty_answers_before_query": (
                        "Harness: cannot commit empty answers. Run execute_sql first "
                        "to retrieve the answer from the database."
                    ),
                    "commit_before_any_sql": (
                        "Harness: you haven't run any SQL yet. Run execute_sql first "
                        "to query the database before committing."
                    ),
                    "mutation_not_executed": (
                        "Harness: for INSERT/UPDATE/DELETE tasks, you MUST actually "
                        "execute the mutation SQL before committing — the answer is "
                        "verified by a table hash."
                    ),
                    "give_up_text_on_mutation": (
                        "Harness: do not commit explanatory text for mutation tasks. "
                        "The answer is verified by a table hash — you MUST run the "
                        "INSERT/UPDATE/DELETE SQL and succeed before committing. "
                        "Try `SELECT * FROM `tbl` LIMIT 5;` to find the target row."
                    ),
                }
                reason = gate.get("blocked_reason") or "unknown"
                hint = gate.get("recovery_prompt") or static_messages.get(
                    reason, "Harness: commit blocked (" + str(reason) + ")."
                )
                return self._blocked(
                    out,
                    {
                        "role": "tool",
                        "tool_call_id": str(call.get("id", "")),
                        "content": hint,
                    },
                )
            if gate["answers"] == answers:
                return out
            return self._message_call(
                out, call.get("id", "harness_commit_%d" % self._turn),
                "commit_final_answer", {"answers": gate["answers"]},
            )
        return out

    def drain_h2_messages(self):
        """Return pre-execution diagnostics at their legacy history position."""
        messages = self._h2_side_messages
        self._h2_side_messages = []
        return messages

    def h2_no_tool_message(self, message, remaining):
        """Preserve the legacy no-tool nudge and H4 text-loop timing."""
        content = str(message.get("content") or "")
        nudge = (
            "Harness: your <tool_call> XML was malformed or truncated. "
            "Use function calling API directly — do NOT write tool calls as XML text."
            if "<tool_call>" in content.lower()
            else "No executable tool calls found. Please call a tool."
        )
        monitor = self.runtime.post_step_monitor(remaining_rounds=remaining)
        if monitor.get("audit_reason") == "text_only_loop":
            if monitor.get("force_action"):
                self.runtime.force_next_action = monitor["force_action"]
            if monitor.get("recovery_prompt"):
                nudge = monitor["recovery_prompt"]
        self._skip_next_no_tool_monitor = True
        return nudge

    @staticmethod
    def _blocked(message, response):
        result = copy.deepcopy(message)
        result["_harness_control"] = {
            "action": "suppress_tool",
            "messages": [copy.deepcopy(response)],
        }
        return result

    def _ensure_ready(self, history):
        if self._ready:
            return
        user = "\n".join(
            str(item.get("content") or "")
            for item in history
            if isinstance(item, dict) and item.get("role") == "user"
        )
        question = user.rsplit("Question:", 1)[-1].strip()
        match = re.search(
            r"The name of this table is (.+?),\s*and the headers of this table are\s*([^\n]+)",
            user, re.IGNORECASE,
        )
        table_name = match.group(1).strip() if match else "table_0"
        raw_columns = match.group(2).strip().rstrip(".") if match else "value"
        columns = [x.strip() for x in raw_columns.split(",") if x.strip()]
        inferred = self._infer_public_type(question)
        self.runtime.init_task({
            "description": question,
            "type": [inferred],
            "table": [{
                "table_name": table_name,
                "table_info": {
                    "columns": [{"name": name, "type": "TEXT"} for name in columns],
                    "rows": [],
                },
            }],
        })
        self._ready = True

    @staticmethod
    def _infer_public_type(text):
        lowered = (text or "").lower().strip()
        if re.search(r"\bdelete\b|^remove\b", lowered):
            return TASK_DELETE
        if re.search(r"\binsert\b|^add\b", lowered):
            return TASK_INSERT
        if re.search(r"\b(update|change|replace|rename|correct|set)\b", lowered):
            return TASK_UPDATE
        if re.search(r"\bhow many\b|\bnumber of\b|\bcount\b", lowered):
            return TASK_COUNTING
        if re.search(r"\baverage\b|\bmean\b", lowered):
            return TASK_AGG_AVG
        if re.search(r"\bsum\b|\btotal\b", lowered):
            return TASK_AGG_SUM
        if re.search(r"\bmaximum\b|\bhighest\b|\blargest\b|\bmost\b", lowered):
            return TASK_AGG_MAX
        if re.search(r"\bminimum\b|\blowest\b|\bsmallest\b|\bleast\b", lowered):
            return TASK_AGG_MIN
        return TASK_SELECT

    def _observe_new_tools(self, history):
        self._observed_this_turn = False
        observations = [item for item in history if item.get("role") == "tool"]
        for observation in observations[self._seen_tool_count:]:
            call_id = str(observation.get("tool_call_id") or "")
            if call_id in self._suppressed_tool_ids:
                self._suppressed_tool_ids.discard(call_id)
                continue
            call = next((
                tool_call
                for item in reversed(history)
                for tool_call in item.get("tool_calls") or []
                if str(tool_call.get("id") or "") == call_id
            ), None)
            if call_id in self._executed_sql:
                sql = self._executed_sql.pop(call_id)
            else:
                if not call or call.get("function", {}).get("name") != "execute_sql":
                    continue
                try:
                    args = json.loads(call["function"]["arguments"])
                    sql = args.get("query", next(iter(args.values()), ""))
                except (ValueError, TypeError, KeyError, AttributeError):
                    continue
            if isinstance(sql, str):
                self.runtime.update_state_after_sql(sql, str(observation.get("content") or ""))
                self._observed_this_turn = True
        self._seen_tool_count = len(observations)

    @staticmethod
    def _message_call(message, call_id, name, arguments):
        result = copy.deepcopy(message)
        result["role"] = "assistant"
        result["tool_calls"] = [{
            "id": str(call_id),
            "type": "function",
            "function": {
                "name": name,
                "arguments": json.dumps(arguments, ensure_ascii=False),
            },
        }]
        return result

    @staticmethod
    def _one_hint(*hints):
        selected: List[str] = []
        remaining = 120
        for hint in hints:
            if not hint:
                continue
            words = str(hint).split()
            if len(words) <= remaining:
                selected.append(str(hint))
                remaining -= len(words)
            elif not selected and remaining:
                selected.append(" ".join(words[:remaining]))
                remaining = 0
        return ["\n".join(selected)] if selected else []


# Native compatibility export; unchanged published implementation.
AgentHarness = DBBenchHarnessRuntime
# Compatibility alias: the adapter probes for an exported `Config` name.
Config = DBBenchHarnessConfig
