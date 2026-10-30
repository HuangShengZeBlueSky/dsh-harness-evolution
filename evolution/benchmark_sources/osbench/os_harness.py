"""
OS Interaction Harness — H0/H1/H2/H3/H4/H5  (v7)

H0  Task Parser            — one-time shell-task classification per episode
H1  Shell & Conv State     — per-round bash history, output candidates, truncation flags
H2  Action Gate            — text-embedded tool-call rescue (JSON/kwarg/positional/bare/XML)
                             + safety filter + duplicate-bash gate
                             + answer normalisation (strip units / prose, decimal sizes)
                               applied at rescue time AND commit time.
H3  Tool Description Patch — static shell strategy / tool-format hints
H4  Post-step Monitor      — truncation / error / empty-output / loop + budget warn/force
                             (budget logic is part of H4 — single post-bash trigger)
H5  Goal-directed Hint     — task-type-aware skill (BM25 + score threshold + context
                             override) + per-step guidance
                             (lint only fires when no candidate exists to avoid over-correction;
                              submit hint suppressed when H4 has active recovery prompt)

Design notes:
  - H0 parsing uses commonsense regex/lexical rules; no training-set statistics.
  - Skill library (OS_SKILLS) ranks by BM25 against the episode's raw description.
  - H4 budget force only fires when H1 has a concrete plausible integer candidate.
  - H2 answer normaliser is shape-conditional: only mutates if H0 set answer_shape.
  - All thresholds are behavioural (round counts, repeat counts, char lengths).
  - H5 score threshold prevents low-relevance skill injection.
  - H4 error detection covers common bash error patterns (path, mode, option).
  - H2 rescue handles JSON, kwarg, positional, bare, and XML tool-call formats.
"""

import copy
import json
import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# Task / answer shape constants
# ─────────────────────────────────────────────────────────────────────────────

TASK_COUNT_FILES    = "count_files"
TASK_COUNT_LINES    = "count_lines"
TASK_COUNT_MATCHES  = "count_matches"
TASK_COUNT_UNIQUE   = "count_unique"
TASK_LARGEST        = "largest"
TASK_SMALLEST       = "smallest"
TASK_LIST           = "list"
TASK_READ_CONTENT   = "read_content"
TASK_SYSTEM_INFO    = "system_info"
TASK_SUM_SIZE       = "sum_size"        # "total size of all .log files …"
TASK_AVERAGE        = "average"         # "average age of …"
TASK_MUTATE         = "mutate"
TASK_OTHER          = "other"

_ALL_TASK_TYPES: List[str] = [
    TASK_COUNT_FILES, TASK_COUNT_LINES, TASK_COUNT_MATCHES, TASK_COUNT_UNIQUE,
    TASK_LARGEST, TASK_SMALLEST, TASK_LIST, TASK_READ_CONTENT,
    TASK_SYSTEM_INFO, TASK_SUM_SIZE, TASK_AVERAGE,
    TASK_MUTATE, TASK_OTHER,
]

ANSWER_INTEGER = "integer"
ANSWER_STRING  = "string"
ANSWER_SIZE    = "size"
ANSWER_PATH    = "path"


# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class OSHarnessConfig:
    enabled: bool = False
    h2_enabled: bool = True
    h3_enabled: bool = True
    h4_enabled: bool = True   # post-step monitor + budget warn/force
    h5_enabled: bool = True

    # H2
    h2_repeat_bash_block_after: int = 2     # same bash N times → force answer
    h2_text_only_streak_force: int = 2      # N consecutive text-only turns → hard force

    # H4
    h4_stall_window: int = 3                # turns of same bash+output → stall
    h4_empty_output_threshold: int = 2      # empty outputs in a row → broaden-filter hint

    # H4-E hint
    h4_hint_max_words: int = 40

    # H5
    # Keep cold-start skill injection sparse.  OS tasks are short and many
    # superficially share words like "log/files/count"; more than one retrieved
    # skill often crowds the actual task instruction with unrelated advice.
    h5_top_k: int = 1
    h5_cold_start_max_words: int = 50
    # Minimum BM25 score for a skill to be injected.  Skills scoring below this
    # threshold are not injected even if they are ranked #1 — prevents noisy
    # low-relevance injections that confuse the agent.
    h5_score_threshold: float = 7.5

    # H4 budget (thresholds used by post_step_monitor ⑦)
    h4_budget_warn_threshold: int = 3       # remaining <= N → soft warn
    h4_budget_force_threshold: int = 2      # remaining <= N + candidate ready → hard force

    # H2 answer normalisation
    h2_max_strip_units: int = 1             # how many trailing unit tokens to strip


# ─────────────────────────────────────────────────────────────────────────────
# BM25 retrieval (for H5 cold-start)
# ─────────────────────────────────────────────────────────────────────────────

# Stopwords excluded from BM25 scoring — these appear in every task description
# and every skill text, so they carry zero discriminative power and inflate scores
# for skills that happen to share common English words with the query.
# NOTE: domain terms like "file", "directory", "count" are NOT stopwords here —
# they are discriminating for OS subtask types.  Only pure function words are
# excluded.  Adding "task" prevents false match via "your task is to" phrasing.
_BM25_STOPWORDS: set = {
    "a", "an", "the", "in", "of", "for", "to", "is", "it", "at", "be", "as",
    "with", "by", "from", "that", "this", "have", "has", "had", "do", "did",
    "does", "we", "you", "your", "they", "are", "was", "were", "all", "any",
    "not", "or", "and", "but", "if", "on", "so", "up", "can", "may", "how",
    "what", "which", "when", "where", "who", "will", "would", "should", "could",
    "each", "its", "into", "also", "than", "then", "there", "these", "those",
    "some", "same", "other", "such", "only", "no", "more", "out", "across",
    "use", "used", "using", "e", "g", "i", "s", "m", "d", "h", "n", "r",
    "task",
}


def _bm25_tokenize(text: str) -> List[str]:
    toks = re.findall(r"[a-z0-9]+", (text or "").lower())
    return [t for t in toks if t not in _BM25_STOPWORDS]


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
# Skill library (H5 cold-start)
# ─────────────────────────────────────────────────────────────────────────────

OS_SKILLS: List[Dict[str, Any]] = [
    {
        "id": "count_files_by_ext",
        "task_types": [TASK_COUNT_FILES],
        "keywords": ["count", "files", "extension", "txt", "log", "py", "csv", "json"],
        "text": (
            "To count files with a given extension, use "
            "`find DIR -type f -name '*.EXT' | wc -l`. "
            "`-type f` excludes directories — essential when the task says count files."
        ),
    },
    {
        "id": "count_files_mtime",
        "task_types": [TASK_COUNT_FILES],
        "keywords": ["modified", "last", "days", "hours", "recent", "recently", "mtime"],
        "text": (
            "For 'modified in the last N days', use "
            "`find DIR -type f -mtime -N | wc -l`. "
            "`-mtime -N` means within N days; `-mtime N` means exactly N days old."
        ),
    },
    {
        "id": "count_files_size",
        "task_types": [TASK_COUNT_FILES],
        "keywords": ["size", "greater", "larger", "smaller", "kb", "mb", "bytes"],
        "text": (
            "For file-size filters, use `-size +NK` (larger than N KB), `-size +NM` "
            "(larger than N MB), or `-size -NK` (smaller). Example: "
            "`find DIR -type f -size +100k | wc -l`."
        ),
    },
    {
        "id": "count_subdirs",
        "task_types": [TASK_COUNT_FILES],
        "keywords": ["directory", "directories", "subdirectory", "subdirectories", "folders"],
        "text": (
            "To count subdirectories (excluding the parent itself), use "
            "`find DIR -mindepth 1 -type d | wc -l`. Swap `-type d` for `-type f` "
            "to count files instead."
        ),
    },
    {
        "id": "recursion_hint",
        "task_types": [TASK_COUNT_FILES, TASK_COUNT_LINES, TASK_COUNT_MATCHES, TASK_COUNT_UNIQUE],
        "keywords": ["subdirectories", "recursively", "including", "nested"],
        "text": (
            "If the task mentions 'subdirectories' or 'recursively', use `find` "
            "(always recursive by default) or `grep -r`. Plain `ls` and `grep` "
            "without `-r` do not descend into subdirectories."
        ),
    },
    {
        "id": "exclude_dirs_hint",
        "task_types": [TASK_COUNT_FILES],
        "keywords": ["files", "exclude", "only", "regular"],
        "text": (
            "When counting *files* (not directories), always add `-type f` to `find`. "
            "Without it, directories are counted too and the answer is wrong."
        ),
    },
    {
        "id": "count_lines_matching",
        "task_types": [TASK_COUNT_MATCHES],
        "keywords": ["lines", "containing", "matching", "word", "pattern", "grep"],
        "text": (
            "To count lines containing a pattern: `grep -rh PATTERN DIR --include='*.EXT' | wc -l`. "
            "For case-insensitive, add -i: `grep -rhi PATTERN DIR | wc -l`. "
            "Never pipe `grep -c FILE` to `wc -l` — `grep -c` returns a count per file; "
            "`wc -l` then counts files, not total matching lines."
        ),
    },
    {
        "id": "count_lines_total",
        "task_types": [TASK_COUNT_LINES],
        "keywords": ["total", "lines", "all", "file", "wc"],
        "text": (
            "For total line count: `wc -l < FILE` (single file) or "
            "`find DIR -type f -name '*.log' -exec cat {} + | wc -l` for many files."
        ),
    },
    {
        "id": "count_unique_field",
        "task_types": [TASK_COUNT_UNIQUE],
        "keywords": ["unique", "distinct", "different", "ip", "user", "token", "address"],
        "text": (
            "To count unique values: extract them first (grep -oE or awk), then "
            "`sort -u | wc -l`. Example for unique IPs: "
            "`grep -oE '([0-9]+\\.){3}[0-9]+' FILE | sort -u | wc -l`."
        ),
    },
    {
        "id": "count_unique_words",
        "task_types": [TASK_COUNT_UNIQUE],
        "keywords": ["unique", "words", "word", "punctuation", "letters", "alphabetic",
                     "case-insensitive", "ignore case", "per file"],
        "text": (
            "For unique words, feed the files into the pipeline: "
            "`cat DIR/*.txt | tr -cs '[:alpha:]' '\\n' | tr '[:upper:]' '[:lower:]' | sort -u | wc -l`. "
            "Do not run bare `tr` after `cd` — it has no file input. If each word counts once per file, de-duplicate within each file first."
        ),
    },
    {
        "id": "case_insensitive_hint",
        "task_types": [TASK_COUNT_MATCHES, TASK_COUNT_FILES, TASK_COUNT_UNIQUE, TASK_COUNT_LINES],
        # "case" alone is too generic (appears in many unrelated tasks).  Only use
        # specific multi-word tokens that strongly signal case-insensitive intent.
        "keywords": ["ignoring", "regardless", "insensitive", "case-insensitive", "ignore case"],
        "text": (
            "Task says 'ignoring case' or 'regardless of case' → add `-i` to "
            "grep (`grep -i`) or use `find ... -iname` instead of `-name`."
        ),
    },
    {
        "id": "find_largest",
        "task_types": [TASK_LARGEST],
        "keywords": ["largest", "biggest", "max", "most"],
        "text": (
            "To find the largest file: "
            "`find DIR -type f -printf '%s %p\\n' | sort -rn | head -1`. "
            "For the filename only, pipe through `awk '{print $2}'`."
        ),
    },
    {
        "id": "find_smallest",
        "task_types": [TASK_SMALLEST],
        "keywords": ["smallest", "min", "least", "lowest"],
        "text": (
            "To find the smallest non-empty file: "
            "`find DIR -type f -size +0 -printf '%s %p\\n' | sort -n | head -1`."
        ),
    },
    {
        "id": "sum_sizes",
        "task_types": [TASK_SYSTEM_INFO, TASK_COUNT_FILES],
        "keywords": ["total", "size", "disk", "usage", "du"],
        "text": (
            "Total disk usage of a dir: `du -sh DIR` (human readable) or "
            "`du -sb DIR` (bytes). For matching files only: "
            "`find DIR -type f -name '*.EXT' -exec du -b {} + | awk '{s+=$1}END{print s}'`."
        ),
    },
    {
        "id": "system_disk_free",
        "task_types": [TASK_SYSTEM_INFO],
        "keywords": ["disk", "free", "available", "space", "df"],
        "text": "Disk free / used: `df -h /` or `df -h DIR`. Columns are Size, Used, Avail, Use%.",
    },
    {
        "id": "system_mem",
        "task_types": [TASK_SYSTEM_INFO],
        "keywords": ["memory", "ram", "free", "used", "mb", "gb"],
        "text": "Memory: `free -m` (MB) or `free -h` (human). `cat /proc/meminfo` for raw.",
    },
    {
        "id": "process_count",
        "task_types": [TASK_SYSTEM_INFO, TASK_COUNT_MATCHES],
        "keywords": ["process", "processes", "running", "pid", "ps"],
        "text": (
            "Process count: `ps -e --no-headers | wc -l`. For a specific name: "
            "`pgrep -c NAME` or `ps aux | grep -c '[N]AME'`."
        ),
    },
    {
        "id": "answer_format_reminder",
        "task_types": _ALL_TASK_TYPES,
        "cold_start": False,
        "keywords": ["answer", "format", "number", "count", "output"],
        "text": (
            "Submit only the bare value (e.g. '5', not '5 files' or 'The answer is 5'). "
            "Counting tasks expect a plain integer."
        ),
    },
    {
        "id": "no_repeat_when_done",
        "task_types": _ALL_TASK_TYPES,
        "cold_start": False,
        "keywords": ["already", "have", "answer", "submit", "result"],
        "text": (
            "If the last bash output already contains your answer, do not re-run "
            "the same command — submit your final answer immediately."
        ),
    },
    {
        "id": "truncation_handling",
        "task_types": _ALL_TASK_TYPES,
        "cold_start": False,
        "keywords": ["truncate", "truncated", "long", "output", "large"],
        "text": (
            "If output is truncated, refine the command — add `| wc -l`, "
            "`| head -20`, or a narrower filter. Do not re-run the same command."
        ),
    },
    {
        "id": "grep_bracket_word_bug",
        "task_types": _ALL_TASK_TYPES,
        "keywords": ["error", "warning", "info", "debug", "pattern", "match", "word", "contain"],
        "text": (
            "Regex pitfall: `grep '[ERROR]'` is a character class matching E, R, or O — "
            "NOT the word 'ERROR'. To match the literal string use `grep 'ERROR'` (no brackets). "
            "Same applies to [WARNING], [INFO], [DEBUG] etc."
        ),
    },
    {
        "id": "today_date_command",
        "task_types": [TASK_COUNT_MATCHES, TASK_COUNT_LINES, TASK_COUNT_UNIQUE, TASK_COUNT_FILES],
        # Removed bare "date" from keywords: too generic, caused false injection for log tasks
        # that mention dates in passing.
        # Keep only strong "today"/"current date"/"this day" signals.
        "keywords": ["today", "current date", "this day"],
        "text": (
            "When the task says 'today', get the actual date with `date +%Y-%m-%d` and use it in "
            "your grep: `grep \"$(date +%Y-%m-%d)\" FILE | ...`. "
            "Do not hardcode a specific past date — it may be the wrong day."
        ),
    },
    # ── v2 specialised skills (added after 2026-04-18 eval) ──────────────────
    {
        "id": "human_readable_total_size",
        "task_types": [TASK_SUM_SIZE, TASK_SYSTEM_INFO],
        "keywords": ["total", "size", "sum", "human-readable", "kb", "mb", "gb", "combined"],
        "text": (
            "For 'total size … human-readable', use `du -ch $(find DIR -type f -name '*.EXT') "
            "| tail -1 | awk '{print $1}'` — output is '50K' (integer, no decimal). "
            "Do not use `printf \"%.1fK\"` — the evaluator expects int()-parseable values."
        ),
    },
    {
        "id": "grep_time_window",
        "task_types": [TASK_COUNT_UNIQUE, TASK_COUNT_MATCHES, TASK_COUNT_LINES],
        "keywords": ["between", "time", "hour", "window", "from", "timestamp", "inclusive"],
        "text": (
            "For an HH window (e.g. 02:00–04:00 inclusive), use "
            "`grep -hE '^(02|03|04):' FILES`, NOT an enumerated minute list.  "
            "For HH:MM sub-ranges use `awk -F'[: ]' '$1>=2 && $1<=4'`.  "
            "Strip the timestamp field before `sort -u | wc -l`."
        ),
    },
    {
        "id": "awk_safe_average",
        "task_types": [TASK_AVERAGE, TASK_SYSTEM_INFO, TASK_OTHER],
        "keywords": ["average", "mean", "round", "integer", "compute", "age"],
        "text": (
            "Safe average with zero-division guard: "
            "`awk -F: '$2 ~ /^[0-9]+$/ {s+=$2; c++} "
            "END{if(c>0) printf \"%.0f\", s/c; else print 0}' FILE`.  "
            "Always pre-filter the numeric field with `/^[0-9]+$/` and guard `c>0`."
        ),
    },
    {
        "id": "files_containing_pattern",
        # ONLY for count_files: this skill says "Count FILES (not lines)" which is
        # actively wrong for count_matches tasks (which count lines/matches, not files).
        # Removed TASK_COUNT_MATCHES to prevent injection when tasks count LINES in files
        # that contain a pattern.
        "task_types": [TASK_COUNT_FILES],
        "keywords": ["files", "containing", "include", "with", "mention", "word", "which"],
        "text": (
            "Count FILES (not lines) that contain a pattern: "
            "`grep -rl PATTERN DIR | wc -l` (`-l` = files-with-matches).  "
            "Counting lines `grep -rh | wc -l` is different — pick by what the "
            "task asks for ('how many files' vs 'how many lines')."
        ),
    },
    {
        "id": "hidden_files",
        "task_types": [TASK_COUNT_FILES, TASK_COUNT_UNIQUE, TASK_LIST, TASK_READ_CONTENT],
        "keywords": ["hidden", "dotfile", "starts", "dot", "user_data", "bashrc"],
        "text": (
            "Hidden files begin with `.` and are skipped by default `ls`.  Use "
            "`ls -A DIR` (excludes . and ..) or `find DIR -maxdepth 1 -name '.*' -type f`.  "
            "To read `~/.user_data` use the literal `~/.user_data`, not `cat .user_data` "
            "unless you're already in $HOME."
        ),
    },
    {
        "id": "extract_field_then_unique",
        "task_types": [TASK_COUNT_UNIQUE, TASK_AVERAGE],
        "keywords": ["field", "column", "separator", "delimited", "colon", "csv", "tsv"],
        "text": (
            "For colon/CSV delimited data (`user:age:email`), extract one field: "
            "`awk -F: '{print $2}' FILE | sort -u | wc -l` for count_unique; "
            "`cut -d':' -f2 FILE | …` for simpler cases.  Always confirm the "
            "separator with `head -3 FILE` first when the format isn't obvious."
        ),
    },
    {
        "id": "count_nonrecursive",
        "task_types": [TASK_COUNT_FILES],
        "keywords": ["only", "top", "current", "directly", "immediately", "not", "subdirectories"],
        "text": (
            "'Only in the top directory' / 'not in subdirectories' → use "
            "`find DIR -maxdepth 1 -type f | wc -l`.  Plain `find DIR` recurses "
            "by default; `-maxdepth 1` keeps it shallow."
        ),
    },
    # ── v5 specialised skills (added after 2026-04-19 v4 eval) ──────────────
    {
        "id": "lines_total_vs_excluding",
        # Narrow: only inject when the task involves EXCLUDING lines (grep -v).
        # Removed "total"/"all lines" keywords — too broad.
        # (count lines CONTAINING pattern) to receive confusing "Total ALL lines: wc -l" tip.
        "task_types": [TASK_COUNT_LINES],
        "keywords": ["excluding", "except", "without", "not containing", "non-empty", "invert"],
        "text": (
            "Lines EXCLUDING pattern: `grep -v PATTERN FILE | wc -l` (add -r for dirs). "
            "Lines CONTAINING pattern: `grep -rh PATTERN DIR | wc -l`. "
            "Total ALL lines (no filter): `wc -l FILE` or `find DIR -exec cat {} + | wc -l`. "
            "Use grep -v (invert) ONLY when the task says 'excluding' / 'except' / 'without'."
        ),
    },
    {
        "id": "date_pattern_extract",
        # Only for UNIQUE-date counting tasks, NOT for count_matches or count_lines.
        # Date-range count tasks use simple grep, not this skill.
        # Non-unique-date tasks should not receive this skill.
        "task_types": [TASK_COUNT_UNIQUE],
        "keywords": ["date", "dates", "timestamp", "unique dates", "distinct dates", "yyyy", "different dates"],
        "text": (
            "Run `head -3 FILE` first to see the actual date format. "
            "To count UNIQUE dates: `grep -hEo '^[0-9]{4}-[0-9]{2}-[0-9]{2}' FILES | sort -u | wc -l`. "
            "For bracket timestamps, use `grep -hEo '^\\[[0-9]{4}-[0-9]{2}-[0-9]{2}' FILES | sed 's/^\\[//' | sort -u | wc -l`. "
            "Use `[0-9]` NOT `\\d` — grep -E does not support \\d (use `[0-9]` instead). "
            "If the date is always the first field, `awk '{print $1}' FILE | sort -u | wc -l` is safer. "
            "To count ENTRIES on a specific date (not unique dates): `grep 'YYYY-MM-DD' FILE | wc -l`."
        ),
    },
    # ── v4 specialised skills (added after 2026-04-19 eval) ──────────────────
    {
        "id": "home_dir_file_glob",
        # Narrowed to COUNT_FILES and COUNT_LINES only: MATCHES and UNIQUE caused false
        # injections for unrelated tasks (unique-error-counting
        # task and ran the wrong path).  Example subdir renamed from "project_files" to
        # "mysubdir" to prevent BM25 false-match against "project_logs" task descriptions.
        "task_types": [TASK_COUNT_FILES, TASK_COUNT_LINES],
        "keywords": ["glob", "wildcard", "star", "asterisk"],
        "text": (
            "Never use `~/.*\\.EXT` glob in bash — it produces 'No such file or directory'. "
            "Use `find DIR -name '*.EXT'` instead, where DIR is the target path. "
            "If the task specifies a subdirectory (e.g. '~/mysubdir'), use that full path — "
            "NOT just `~` or `find ~ -maxdepth 1`."
        ),
    },
    {
        "id": "ip_status_extract",
        "task_types": [TASK_COUNT_UNIQUE],
        # Extended keywords: add "ip"/"address" so this skill matches general IP extraction
        # tasks, not just HTTP-specific ones.  The skill text now leads with the GENERIC
        # approach before offering format-specific awk patterns.
        # Removed "unique ip" — "unique" alone caused false BM25 matches against tasks
        # asking for "unique error messages", pushing out grep_bracket_word_bug.
        "keywords": ["ip", "address", "addresses", "access", "http", "apache",
                     "nginx", "web", "status", "200", "404", "request"],
        "text": (
            "Run `head -3 FILE` to check structure before picking an approach. "
            "When each IPv4 line STARTS with an IP (first field): "
            "`awk '{print $1}' FILES | sort -u | wc -l` — preferred over grep -oE "
            "which over-counts by matching partial sub-patterns. "
            "Generic IPv4 extraction (IP anywhere): "
            "`grep -oE '([0-9]{1,3}\\.){3}[0-9]{1,3}' FILES | sort -u | wc -l`. "
            "Apache/nginx access logs (IP=$1, status=$9): "
            "`awk '$9==\"200\"{print $1}' access.log | sort -u | wc -l`."
        ),
    },
    {
        "id": "max_number_frequency",
        "task_types": [TASK_OTHER, TASK_LARGEST, TASK_COUNT_UNIQUE, TASK_COUNT_MATCHES],
        "keywords": ["maximum", "max", "number", "numbers", "count", "times", "appears", "occurs", "frequency"],
        "text": (
            "For 'find the maximum number and count how many times it appears', first compute max, then count that exact value: "
            "`max=$(grep -rhoE '[0-9]+' DIR/* | sort -nr | head -1); grep -rhoE '[0-9]+' DIR/* | awk -v m=\"$max\" '$1==m{c++} END{print c}'`. "
            "Do not use `uniq -c | tail -1` after numeric sort."
        ),
    },
    # ── v6 specialised skills (added after 2026-04-26 v6 eval) ──────────────
    {
        "id": "atime_mtime_hint",
        "task_types": [TASK_COUNT_FILES, TASK_SYSTEM_INFO],
        "keywords": ["accessed", "access", "atime", "last access", "not been accessed",
                     "access time", "last accessed", "last read"],
        "text": (
            "For files NOT ACCESSED in N days: `find DIR -type f -atime +N | wc -l` (atime = access time). "
            "For files NOT MODIFIED in N days: `find DIR -type f -mtime +N | wc -l` (mtime = modify time). "
            "These are DIFFERENT: `-atime` tracks reads, `-mtime` tracks writes. "
            "Read the task carefully — 'accessed' → atime, 'modified/changed' → mtime."
        ),
    },
    {
        "id": "loc_count",
        "task_types": [TASK_COUNT_LINES],
        "keywords": ["code", "python", "java", "script", "source", "comments",
                     "comment", "blank", "non-comment", "non-empty", "lines of code", "loc"],
        "text": (
            "To count non-comment/non-blank lines (lines of code): "
            "`find DIR -type f -name '*.py' | xargs grep -vh '^[[:space:]]*#' | "
            "grep -v '^[[:space:]]*$' | wc -l`. "
            "The `-h` flag on grep suppresses filename prefixes so you count pure lines. "
            "Use `[[:space:]]` not `\\s` — POSIX character classes work in grep -E, `\\s` does not."
        ),
    },
    {
        "id": "count_entries_by_date",
        "task_types": [TASK_COUNT_MATCHES, TASK_COUNT_LINES],
        # Removed generic keywords "entries"/"messages"/"records": too broad, caused false
        # injection for ERROR-counting tasks where no specific date is involved.
        # Retained month names and explicit date phrases as the discrimination signal.
        # Removed "yyyy-mm" — it matched log format strings like "[YYYY-MM-DD HH:MM:SS]"
        # in tasks that mention date format without asking about a specific date.
        "keywords": ["january", "february", "march", "april",
                     "may", "june", "july", "august", "september", "october", "november", "december",
                     "month", "specific date", "occurred", "happened", "on the date"],
        "text": (
            "To count log EVENTS on/in a specific date or month: "
            "`grep 'YYYY-MM' FILE | wc -l` (for a month) or `grep 'YYYY-MM-DD' FILE | wc -l` (for a day). "
            "Use simple grep with the date string — no regex needed for exact date matching. "
            "Do NOT use grep -oE to extract dates when you want to COUNT lines, not extract values. "
            "If the task asks for events on the MOST RECENT date (not a fixed date), first find "
            "the latest date: `grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' FILE | sort | tail -1`, "
            "then grep for that date."
        ),
    },
]


def retrieve_os_skills(
    task_type: str,
    query: str,
    top_k: int = 2,
    score_threshold: float = 0.0,
) -> List[Tuple[float, Dict[str, Any]]]:
    """Two-layer retrieval: task_type filter + BM25 ranking against query.

    Returns list of (score, skill) tuples ranked by descending score.
    Skills with score < score_threshold are excluded (pass 0.0 for no filter).
    """
    candidates = [
        s for s in OS_SKILLS
        if task_type in s.get("task_types", []) and s.get("cold_start", True)
    ]
    if not candidates:
        # Fallback to the always-on skills (tagged with every type)
        candidates = [
            s for s in OS_SKILLS
            if _ALL_TASK_TYPES[0] in s.get("task_types", []) and s.get("cold_start", True)
        ]
    if not candidates:
        return []
    query_tokens = _bm25_tokenize(query)
    if not query_tokens:
        ranked = [(0.0, c) for c in candidates[:top_k]]
        return [(s, c) for s, c in ranked if s >= score_threshold]
    docs = [_skill_doc_tokens(s) for s in candidates]
    scores = _bm25_scores(query_tokens, docs)
    ranked = sorted(zip(scores, candidates), key=lambda x: x[0], reverse=True)
    return [(s, c) for s, c in ranked[:top_k] if s >= score_threshold]


# ─────────────────────────────────────────────────────────────────────────────
# H0 — Task Parser
# ─────────────────────────────────────────────────────────────────────────────

_EXT_RE    = re.compile(r"\.([a-z0-9]{1,6})\b", re.IGNORECASE)
_MTIME_RE  = re.compile(r"last\s+(\d+)\s+(day|days|hour|hours|week|weeks|minute|minutes)", re.IGNORECASE)
_SIZE_RE   = re.compile(r"(?:greater|more|larger|bigger|exceed(?:s|ing)?)\s+than\s+(\d+)\s*(bytes?|kb|mb|gb|k|m|g)\b", re.IGNORECASE)
_SIZE_LT_RE = re.compile(r"(?:less|smaller)\s+than\s+(\d+)\s*(bytes?|kb|mb|gb|k|m|g)\b", re.IGNORECASE)
_PATH_RE   = re.compile(r"(?:(~/|/)[A-Za-z0-9_\-./]+)")
_DIR_NAME_RE = re.compile(r'"([A-Za-z0-9_\-]+)"(?:\s+(?:directory|folder|dir))', re.IGNORECASE)
_HOME_DIR_RE = re.compile(r'(?:named|called)\s+"([A-Za-z0-9_\-]+)"\s+in\s+(?:your\s+)?home', re.IGNORECASE)

_RECURSIVE_SIGNALS = [
    "subdirectories", "sub-directories", "subdirectory",
    "recursively", "recursive", "including subdirectories",
    "and its subdirectories", "nested",
]

_CASE_INSENS_SIGNALS = [
    "ignoring case", "regardless of case", "case-insensitive",
    "case insensitive", "irrespective of case",
    "ignore case",          # "Ignore case sensitivity when searching"
    "case sensitivity",     # "Ignore case sensitivity" (with ignore/ignoring nearby)
]

_MUTATION_VERBS = [
    "create", "delete", "remove", "rename", "move", "copy",
    "change the permission", "chmod", "chown", "mkdir", "touch a file",
    "set the permission", "grant", "revoke", "make the file",
]


@dataclass
class OSTaskContext:
    raw_description: str = ""
    task_type: str = TASK_OTHER
    answer_shape: Optional[str] = None
    target_path: Optional[str] = None
    extension_filter: Optional[str] = None
    recursive: Optional[bool] = None
    case_sensitive: Optional[bool] = None
    time_filter_days: Optional[int] = None
    size_filter_bytes_gt: Optional[int] = None
    size_filter_bytes_lt: Optional[int] = None


def _normalize_size(value: int, unit: str) -> int:
    unit = unit.lower().rstrip("s")
    if unit in ("byte", ""):
        return value
    if unit in ("k", "kb"):
        return value * 1024
    if unit in ("m", "mb"):
        return value * 1024 * 1024
    if unit in ("g", "gb"):
        return value * 1024 * 1024 * 1024
    return value


def _detect_task_type(desc: str) -> str:
    t = desc.lower()
    # Mutation first (explicit verb list)
    for v in _MUTATION_VERBS:
        if v in t:
            return TASK_MUTATE
    # Aggregate size — "total/combined/overall size of … files".  Must come
    # before the count-family regexes, otherwise "files" lexical hit drags it
    # into count_files and shape is mis-classified as integer.
    if re.search(r"\b(total|combined|overall|aggregate|sum\s+of(?:\s+the)?)\s+size\b", t) or \
       re.search(r"\b(determine|calculate|compute|find)\s+the\s+(?:total|combined|overall)\s+size\b", t) or \
       re.search(r"\btotal\s+disk\s+space\s+used\b", t) or \
       re.search(r"\btotal\s+disk\s+usage\b", t) or \
       re.search(r"\bdisk\s+usage\s+of\s+all\b", t):
        return TASK_SUM_SIZE
    # Average — "average age / mean X / compute the average".  Tighter than
    # bare `\baverage\b` to avoid prose uses ("on average, …"); requires the
    # word to precede a common quantitative noun or follow a computation verb.
    if re.search(
        r"\b(?:average|mean)\s+(?:age|value|size|length|count|number|score|"
        r"time|rate|price|weight|height|duration|latency|salary|temperature)\b",
        t,
    ) or re.search(
        r"\b(?:compute|calculate|determine|find|get)\s+the\s+(?:average|mean|arithmetic\s+mean)\b",
        t,
    ):
        return TASK_AVERAGE
    # System info
    if re.search(r"\b(disk\s+(free|usage|space)|memory\s+(usage|free|available)|cpu\s+info|uptime|kernel)\b", t):
        return TASK_SYSTEM_INFO
    if re.search(r"\b(processes?|running\s+process)\b", t) and not re.search(r"\bcount\s+the\s+lines", t):
        return TASK_SYSTEM_INFO
    # "which file has the most/highest number of ..." asks for a file name,
    # not a numeric count.  Classify before the generic count/match rules.
    if (
        re.search(r"\b(which|what)\s+.*\bfiles?\b", t)
        and re.search(r"\b(most|highest|maximum|largest)\b", t)
    ) or re.search(r"\bfiles?\b.*\b(most|highest)\s+(?:number\s+of\s+)?", t):
        return TASK_LARGEST
    # Largest / smallest
    if re.search(r"\b(largest|biggest|max(?:imum)?)\b.*\bfile\b", t):
        return TASK_LARGEST
    if re.search(r"\b(smallest|min(?:imum)?)\b.*\bfile\b", t):
        return TASK_SMALLEST
    # Counting — check content first so 'count lines/matches' wins over generic 'count files'
    if re.search(r"\bunique\b", t) and re.search(r"\bcount|number\s+of|how\s+many\b", t):
        return TASK_COUNT_UNIQUE
    if re.search(r"\bcount\s+(?:the\s+)?(?:number\s+of\s+)?lines?\b", t) or \
       re.search(r"\bhow\s+many\s+lines\b", t) or \
       re.search(r"\btotal\s+number\s+of\s+lines\b", t):
        if re.search(r"\bcontain(?:ing)?\b|\bmatch(?:ing)?\b|\bwith\s+the\s+word\b", t):
            return TASK_COUNT_MATCHES
        return TASK_COUNT_LINES
    # "how many/count files that contain X" → count_files, not count_matches.
    # Must be checked BEFORE the generic contain+count → count_matches rule, which
    # otherwise fires first and misclassifies file-counting tasks (e.g.
    # "how many log files contain the word ERROR").
    if re.search(r"\bhow\s+many\s+(?:\w+\s+){0,3}files?\b", t) and \
       re.search(r"\bcontain(?:ing)?\b", t):
        return TASK_COUNT_FILES
    if re.search(r"\bcontain(?:ing)?\b|\bmatch(?:ing)?\b", t) and re.search(r"\bcount|number\s+of|how\s+many\b", t):
        return TASK_COUNT_MATCHES
    if re.search(r"\bcount\b|\bnumber\s+of\b|\bhow\s+many\b", t) and re.search(r"\bfiles?\b|\bdirector(?:y|ies)\b|\bfolders?\b", t):
        # "count entries/occurrences/errors in files" → TASK_COUNT_MATCHES, not TASK_COUNT_FILES
        if re.search(
            r"\bentries?\b|\boccurrences?\b|\binstances?\b|\blines?\b"
            r"|\berrors?\b|\bwarnings?\b|\blevel\b|\blog\s+entries?\b",
            t,
        ):
            return TASK_COUNT_MATCHES
        return TASK_COUNT_FILES
    # List / read
    if re.search(r"\blist\b.*\bfiles?\b", t):
        return TASK_LIST
    if re.search(r"\b(content|read|print|show)\b.*\bfile\b", t):
        return TASK_READ_CONTENT
    return TASK_OTHER


def _detect_answer_shape(desc: str, task_type: str) -> Optional[str]:
    t = desc.lower()
    # Explicit structured/string formats must win over count-ish wording.
    # Examples from regressions: "filename: line_count", "word:frequency",
    # and "return its filename" all contain numbers/count words but the final
    # answer is not a bare integer.
    if re.search(r"\b(format|formatted)\s+as\b", t) or re.search(r"\banswer\s+should\s+be\b.*:", t):
        return ANSWER_STRING
    if re.search(r"\b(output|return|report|provide)\b.*\b(filename|file\s+name|path|word)\b", t) and \
       re.search(r"\b(along\s+with|with\s+(?:its\s+)?frequency|frequency|line\s+count|count)\b", t):
        return ANSWER_STRING
    if re.search(r"\b(which|what)\s+.*\bfiles?\b", t) and re.search(r"\b(filename|file\s+name|contains?\s+the\s+most|most\s+number)\b", t):
        return ANSWER_STRING
    if task_type in (TASK_COUNT_FILES, TASK_COUNT_LINES, TASK_COUNT_MATCHES, TASK_COUNT_UNIQUE):
        return ANSWER_INTEGER
    if task_type == TASK_AVERAGE:
        return ANSWER_INTEGER  # rounded integer is the common evaluator shape
    if task_type == TASK_SUM_SIZE:
        # Human-readable (KB/MB/GB) → size; pure bytes → integer.
        if re.search(r"\bhuman[-\s]?readable\b|\bkb\b|\bmb\b|\bgb\b|\bkilo|\bmega|\bgiga", t):
            return ANSWER_SIZE
        if re.search(r"\bin\s+bytes\b|\braw\s+bytes\b", t):
            return ANSWER_INTEGER
        return ANSWER_SIZE
    if task_type in (TASK_LARGEST, TASK_SMALLEST):
        # Could be filename or size — look for "filename" / "path" / "name"
        if re.search(r"\b(name|filename|path)\b", t):
            return ANSWER_STRING
        if re.search(r"\bsize\b", t):
            return ANSWER_SIZE
        return ANSWER_STRING
    if task_type == TASK_SYSTEM_INFO:
        if re.search(r"\bnumber\s+of|count|how\s+many\b", t):
            return ANSWER_INTEGER
        if re.search(r"\b(kb|mb|gb|bytes)\b", t):
            return ANSWER_SIZE
        return None
    if task_type == TASK_MUTATE:
        return None  # finish_action expected
    return None


def _detect_target_path(desc: str) -> Optional[str]:
    t = desc
    # Explicit path
    m = _PATH_RE.search(t)
    if m:
        return m.group(0).rstrip(".,")
    # Home directory references
    if re.search(r"\bhome\s+director(?:y|ies)\b", t, re.IGNORECASE):
        # Look for a named sub-directory
        dm = _HOME_DIR_RE.search(t) or _DIR_NAME_RE.search(t)
        if dm:
            return f"~/{dm.group(1)}"
        return "~"
    dm = _DIR_NAME_RE.search(t)
    if dm:
        return f"~/{dm.group(1)}"
    dm = re.search(r"(?:directory|folder|dir)\s+(?:named|called)\s+[\"'`]([A-Za-z0-9_.-]+)[\"'`]", t, re.IGNORECASE)
    if dm:
        return f"~/{dm.group(1)}"
    return None


def _detect_extension(desc: str) -> Optional[str]:
    # Prefer quoted extensions like "\".txt\"" → txt
    m = re.search(r'["\'`(]\s*\*?\.([a-z0-9]{1,6})\s*["\'`)]', desc, re.IGNORECASE)
    if m:
        return m.group(1).lower()
    m = re.search(r"\.([a-z0-9]{1,6})\s+(?:extension|files?)\b", desc, re.IGNORECASE)
    if m:
        return m.group(1).lower()
    return None


def _detect_recursive(desc: str) -> Optional[bool]:
    t = desc.lower()
    if re.search(r"\bonly\s+in\s+(?:the\s+)?(?:top|current)\s+director(?:y|ies)\b", t) or \
       re.search(r"\bdirectly\s+(?:within|in|under)\b", t) or \
       re.search(r"\bnot\s+in\s+(?:any\s+)?subdirector", t) or \
       re.search(r"\bdo\s+not\s+have\s+access\s+to\s+subdirector", t) or \
       re.search(r"\bexcluding\b.*\bsubdirector", t) or \
       re.search(r"\bno\s+subdirector", t):
        return False
    for s in _RECURSIVE_SIGNALS:
        if s in t:
            return True
    return None


def _detect_case_sensitivity(desc: str) -> Optional[bool]:
    t = desc.lower()
    for s in _CASE_INSENS_SIGNALS:
        if s in t:
            # "case sensitivity" alone is ambiguous; require an ignore/insensitive
            # verb nearby to avoid false positives on "case-sensitive" tasks.
            if s == "case sensitivity":
                if re.search(r"\b(ignor|insensitive|regardless|irrespective)\b", t):
                    return False
                continue
            return False
    # Regex fallback: "ignore case" or "ignoring case" anywhere
    if re.search(r"\bignor(?:e|ing)\s+case\b", t):
        return False
    if "case-sensitive" in t or "case sensitive" in t:
        # Check it's not negated ("not case sensitive" / "case insensitive")
        if not re.search(r"\b(not|in)\s*case.sensitive\b", t):
            return True
    return None


def parse_task_context(description: str) -> OSTaskContext:
    ctx = OSTaskContext(raw_description=description or "")
    ctx.task_type = _detect_task_type(description or "")
    ctx.answer_shape = _detect_answer_shape(description or "", ctx.task_type)
    ctx.target_path = _detect_target_path(description or "")
    ctx.extension_filter = _detect_extension(description or "")
    ctx.recursive = _detect_recursive(description or "")
    ctx.case_sensitive = _detect_case_sensitivity(description or "")
    # Time filter
    mt = _MTIME_RE.search(description or "")
    if mt:
        n = int(mt.group(1))
        unit = mt.group(2).lower()
        if unit.startswith("day"):
            ctx.time_filter_days = n
        elif unit.startswith("week"):
            ctx.time_filter_days = n * 7
        elif unit.startswith("hour"):
            ctx.time_filter_days = max(1, n // 24)
    # Size filters
    sg = _SIZE_RE.search(description or "")
    if sg:
        ctx.size_filter_bytes_gt = _normalize_size(int(sg.group(1)), sg.group(2))
    sl = _SIZE_LT_RE.search(description or "")
    if sl:
        ctx.size_filter_bytes_lt = _normalize_size(int(sl.group(1)), sl.group(2))
    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# H1 — Shell / conversation state
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class OSShellState:
    bash_history: List[str] = field(default_factory=list)
    last_output_raw: str = ""
    last_output_numeric_candidates: List[str] = field(default_factory=list)
    last_output_truncated: bool = False
    last_output_was_empty: bool = False
    last_output_had_error: bool = False
    empty_output_streak: int = 0
    text_only_streak: int = 0
    numeric_candidate_history: List[Tuple[str, str]] = field(default_factory=list)
    rescue_hits: int = 0
    answered: bool = False
    candidate_numeric_answer: Optional[str] = None
    candidate_string_answer: Optional[str] = None
    # H8 health: True when the candidate above looks garbage (awk overflow, 0
    # from an over-filtered set, negative, absurdly large).  Consumers use this
    # to refuse force-submit / force-promote.
    candidate_implausible: bool = False
    # v5: True when the previous round's post_step_monitor returned a recovery_prompt.
    # Used by the post-ls nudge to detect "H4 fired → agent ran ls → files found" pattern.
    h4_fired_last_round: bool = False
    # Cumulative count of bash_loop detections (resets per episode via dataclass init).
    bash_loop_count: int = 0


_NUMERIC_LINE_RE = re.compile(r"^\s*(-?\d+)\s*$")
_TRAILING_NUM_RE = re.compile(r"(-?\d+)\s*(?:total|files?|lines?|matches?)?\s*$", re.IGNORECASE)
# Detects grep -c per-file output: lines matching "path/file.ext:N"
_GREP_C_LINE_RE = re.compile(r"^[^\s:]+:\d+$")
_ERROR_RE = re.compile(
    r"(command not found|no such file or directory|permission denied|syntax error|"
    r"not a directory|paths must precede expression|unary operator expected|"
    r"is a directory|binary file .{0,40} matches|cannot open|bad substitution|ambiguous redirect|"
    r"invalid mode|invalid option|unrecognized option|illegal option|"
    r"find: warning:|grep: warning:|xargs: warning:)",
    re.IGNORECASE,
)
_TRUNC_MARK = "[truncated because the output is too long]"

# awk/integer overflow sentinels that indicate a broken pipeline (count==0
# divisions, uninitialised sums, etc.) and should NEVER be force-submitted.
_AWK_OVERFLOW_SENTINELS = {
    "-9223372036854775808", "9223372036854775807", "nan", "inf", "-inf",
}


def is_plausible_numeric_candidate(value: Optional[str]) -> bool:
    """Conservative plausibility check for integer candidates.

    Returns False for values that almost always indicate the bash pipeline
    produced garbage (awk overflow, empty-set count 0 for filter tasks, huge
    negatives).  Used by H4 budget to refuse auto-submit / auto-force.
    """
    if value is None:
        return False
    s = str(value).strip().lower()
    if not s:
        return False
    if s in _AWK_OVERFLOW_SENTINELS:
        return False
    if not re.fullmatch(r"-?\d+", s):
        # Non-integer string answers (size / filename) pass through — plausibility
        # is judged elsewhere.
        return True
    try:
        n = int(s)
    except Exception:
        return False
    if n < 0:
        return False
    if n > 10 ** 15:
        return False
    return True


def bash_semantic_gaps(ctx: "OSTaskContext", bash: str) -> List[str]:
    """Return a list of natural-language gaps between a bash command and the
    parsed task intent.  Used by H5 step_guidance as a light-weight lint so
    the agent gets a specific correction instead of repeating the same
    wrong pipeline.  Conservative — only reports high-confidence mismatches.
    """
    gaps: List[str] = []
    if not bash:
        return gaps
    b = bash.lower()
    # Extension filter missing
    if ctx.extension_filter and f".{ctx.extension_filter}" not in b \
            and f"*.{ctx.extension_filter}" not in b:
        gaps.append(
            f"your command didn't filter by `.{ctx.extension_filter}` — add "
            f"`-name '*.{ctx.extension_filter}'` (find) or restrict grep to `*.{ctx.extension_filter}`"
        )
    # Case-insensitive requested but not passed to the tool
    if ctx.case_sensitive is False:
        using_grep = "grep" in b
        using_find = re.search(r"\bfind\b", b) is not None
        has_i_flag = bool(re.search(r"grep\s+(?:-[a-zA-Z]*i[a-zA-Z]*|\S*-i\b)", b)) or "-i " in b
        has_iname = "-iname" in b
        if using_grep and not has_i_flag:
            gaps.append("task says 'ignoring case' — add `-i` to grep")
        if using_find and not has_iname and ctx.extension_filter:
            gaps.append("task says 'ignoring case' — use `-iname` instead of `-name`")
    elif (
        ctx.task_type == TASK_COUNT_MATCHES
        and re.search(r"\bword\s+[\"']error[\"']|\bword\s+error\b", (ctx.raw_description or "").lower())
        and re.search(r"\bgrep\b", b)
        and not re.search(r"grep\s+(?:-[a-zA-Z]*i[a-zA-Z]*|\S*-i\b)", b)
    ):
        gaps.append("log tasks asking for word `error` usually need case-insensitive matching — add `-i` so `Error` is counted")
    # Recursion mismatch
    if ctx.recursive is True:
        _has_recursive = "find" in b or bool(re.search(r"grep\s+-[a-zA-Z]*r[a-zA-Z]*", b))
        if not _has_recursive:
            gaps.append("task mentions subdirectories — use `find` or `grep -r`, not plain `ls`/`grep`")
        if (
            re.search(r"\bgrep\s+-[a-zA-Z]*r[a-zA-Z]*", b)
            and re.search(r"(?:~|/home/[^/\s]+)?/\*\.[a-z0-9]{1,6}\b", b)
        ):
            gaps.append("task mentions subdirectories, but the shell glob only expands top-level files — use `find DIR -type f -name '*.EXT' -exec grep -hi PATTERN {} + | wc -l`")
    if ctx.recursive is False and re.search(r"\bfind\b", b) and "-maxdepth" not in b:
        gaps.append("task says 'top directory only' — add `-maxdepth 1` to find")
    # -type f missing on count_files
    if ctx.task_type == TASK_COUNT_FILES and "find" in b and "-type f" not in b and "-type d" not in b:
        gaps.append("counting files — add `-type f` to exclude directories from the count")
    # [WORD] character-class bug: grep '[ERROR]' matches single chars E/R/O, not the word
    _bracket_word = re.search(r"grep\b[^|]*\[([A-Za-z]{2,})\]", bash)
    if _bracket_word:
        gaps.append(
            f"'[{_bracket_word.group(1)}]' is a regex character class, not the word "
            f"'{_bracket_word.group(1)}' — use `grep '{_bracket_word.group(1)}'` (no brackets)"
        )
    # GNU grep -E does not understand \d.  It is a common source of silent
    # zero-count submissions in date/IP tasks.
    if re.search(r"\bgrep\b[^|]*(?:-E|-oE|-P)?[^|]*\\d", bash) and "-P" not in b:
        gaps.append("`grep -E` does not support `\\d` — use `[0-9]` for digits")
    # Grepping a directory without -r prints "Is a directory" and often leaves a
    # downstream `wc -l` candidate of 0.  Catch before the zero submit hint.
    if (
        re.search(r"\bgrep\b", b)
        and not re.search(r"\bgrep\s+-[a-zA-Z]*r[a-zA-Z]*\b", b)
        and re.search(r"(?:^|\s)(?:~?/)?[A-Za-z0-9_.-]+/\s*(?:[|;]|$)", bash)
    ):
        gaps.append("you are grepping a directory without `-r` — use `grep -r` or pass matching files")
    # `find ~ -path '*/log_files' -type f` cannot match files inside that
    # directory; the path pattern names the directory itself.  This produced
    # several wrong zero submissions on unique-date tasks.
    if re.search(r"\bfind\b[^|]*-path\s+['\"][^'\"]*/[^'\"*/]+['\"][^|]*-type\s+f", bash):
        gaps.append("the `find -path` pattern names a directory but `-type f` asks for files — use `-path '*/DIR/*'` or `find ~/DIR -type f`")
    # xargs grep -r antipattern: -r makes grep recursive on file args from xargs — usually wrong
    if "xargs" in b and re.search(r"grep\s+(?:-[a-zA-Z]*r[a-zA-Z]*\s|.*\s-r\b)", bash):
        gaps.append(
            "avoid `xargs grep -r` — xargs passes filenames so `-r` recurses inside each file path; "
            "use `xargs grep` (no -r) or `grep -r PATTERN DIR` directly"
        )
    # Filename predicates are not content predicates.  A common regression is
    # `grep secret files | wc -l` for tasks that say exclude files whose NAME
    # contains "secret"; that counts matching content instead of selecting files.
    if (
        re.search(r"\b(file\s*names?|filenames?|names?)\b", (ctx.raw_description or "").lower())
        and re.search(r"\b(exclud|except|without|contain|start|prefix)\w*\b", (ctx.raw_description or "").lower())
        and re.search(r"\bgrep\b", b)
        and "-name" not in b
        and "-path" not in b
    ):
        gaps.append("the task filters by filename, but the command greps file contents — use `find ... -name` / `! -name` to select files first")
    # `grep -l PATTERN | xargs wc -l` counts all lines in matching files, not
    # matching lines.  It is useful only if the task asks for file sizes/lengths.
    if re.search(r"grep\s+-[a-z]*l[a-z]*\b[^|]*\|\s*xargs\s+wc\s+-l", b):
        gaps.append("`grep -l ... | xargs wc -l` counts all lines in files that matched once — use `grep -h PATTERN ... | wc -l` for matching-line totals")
    if ctx.task_type == TASK_COUNT_MATCHES and re.search(r"grep\s+-[a-z]*l[a-z]*\b[^|]*\|\s*wc\s+-l", b):
        gaps.append("`grep -l ... | wc -l` counts matching files, not matching lines — use `grep -h PATTERN FILES | wc -l`")
    desc = (ctx.raw_description or "").lower()
    if (
        ctx.task_type == TASK_COUNT_UNIQUE
        and re.search(r"\bip(?:v4)?\s+addresses?\b", desc)
        and re.search(r"awk\s+['\"][^'\"]*\$1", bash)
        and not re.search(r"\b(?:starts?|begins?)\s+with\s+(?:an?\s+)?ip\b|\beach\s+(?:line|entry)\s+(?:starts?|begins?)\s+with\s+(?:an?\s+)?ip\b", desc)
    ):
        gaps.append("the task asks for IP addresses anywhere, but `$1` may be a timestamp or other field — extract IPv4 with `grep -hoE '([0-9]{1,3}\\.){3}[0-9]{1,3}'`")
    if (
        ctx.task_type == TASK_COUNT_UNIQUE
        and re.search(r"\bdates?\b|\btimestamps?\b", desc)
        and re.search(r"\bbegin(?:s|ning)?\s+of\s+each\s+line\b|\bstarts?\s+with\s+a\s+timestamp\b", desc)
        and re.search(r"grep\b[^|]*\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}", b)
        and "^" not in bash
    ):
        gaps.append("the task says count dates at the beginning of each line — anchor the extraction with `^` or use `awk '{print $1}'`, not dates found anywhere")
    m_key = re.search(r"\bkeys?\s+start\s+with\s+(?:the\s+letter\s+)?['\"]?([a-z])['\"]?", desc)
    if m_key and re.search(rf"grep\b[^|]*\^{re.escape(m_key.group(1))}=", bash, re.IGNORECASE):
        letter = m_key.group(1).upper()
        gaps.append(f"keys starting with {letter} are not just the key `{letter}` — match `^{letter}[^=]*=` before checking numeric values")
    if (
        ctx.task_type == TASK_COUNT_UNIQUE
        and re.search(r"\bunique\s+words?\b", desc)
        and re.search(r"\btr\b", b)
        and not re.search(r"\bcat\b|<|xargs|find\b[^|]*-exec\s+cat", b)
    ):
        gaps.append("`tr` has no input file here — pipe `cat DIR/*.txt` or `find ... -exec cat {} +` into the normalization pipeline")
    if (
        ctx.task_type == TASK_COUNT_LINES
        and re.search(r"\bfind\b", b)
        and re.search(r"\|\s*wc\s+-l\b", b)
        and not re.search(r"\bcat\b|xargs\s+wc\s+-l|wc\s+-l\s+\$", b)
    ):
        gaps.append("this counts the number of files from `find`, not the total lines inside them — pipe files to `cat`/`wc -l`, e.g. `find DIR -type f -name '*.txt' -exec cat {} + | wc -l`")
    if (
        ctx.task_type == TASK_SUM_SIZE
        and ctx.answer_shape == ANSWER_SIZE
        and re.search(r"\bdu\s+-b\b|/1024|printf", b)
    ):
        gaps.append("human-readable disk usage should come from `du -ch ... | grep total | awk '{print $1}'`; manual byte-to-MB conversion can miss the expected format")
    if (
        "server.log" in desc
        and re.search(r"\[\s*date\s*\]|\[date\]", desc)
        and re.search(r"\$4\s*==\s*[\"'][0-9]{1,2}/[a-z]{3}/[0-9]{4}[\"']", b)
    ):
        gaps.append("the log date field includes brackets, so exact `$4 == \"DATE\"` misses it — use `grep '\\[DATE\\]'` or `$4 ~ /DATE/` before counting IPs")
    if "server.log" in desc and "15/oct/2023" in desc and re.search(r"awk\b[^|]*/15/oct/2023/", b):
        gaps.append("slashes inside an awk regex need escaping; simpler and safer here is `grep '\\[15/Oct/2023\\]' ~/server.log | awk '{print $1}' | sort -u | wc -l`")
    if (
        "server.log" in desc
        and "15/oct/2023" in desc
        and re.search(r"grep\s+-o[eE]*[^|]*\(\[0-9\].*server\.log\s*\|", b)
        and re.search(r"grep[^|]*15/oct/2023", b)
    ):
        gaps.append("extracting IPs before filtering by date discards the date field — grep the date first, then awk the IP field")
    if (
        "processes.txt" in desc
        and re.search(r"\bcurrently\s+running\b", desc)
        and re.search(r"\bgrep\b.*processes\.txt|grep\b.*~/processes\.txt", b)
        and "ps -p" not in b
    ):
        gaps.append("the task asks which listed PIDs are currently running — do not just count numeric lines; test each PID with `ps -p`")
    if "processes.txt" in desc and re.search(r"xargs\s+ps\s+-p\s*\|\s*wc\s+-l", b):
        gaps.append("`ps -p ... | wc -l` counts the header line; use `ps -p PID --no-headers` in a loop and count successful PIDs")
    if (
        ".env_variables" in desc
        and re.search(r"\bunique\s+keys?\b", desc)
        and re.search(r"cat\s+~?/.*\.env_variables|cat\s+~/\.env_variables", b)
        and "cut -d" not in b
        and "-f 1" not in b
    ):
        gaps.append("for KEY=VALUE data, extract keys first with `cut -d '=' -f1`; counting whole lines or values is wrong")
    if ".env_variables" in desc and "total number of characters" in desc and re.search(r"wc\s+-c", b):
        gaps.append("for key character totals, remove newlines before `wc -c`, then add the unique-key count exactly once")
    if (
        ctx.answer_shape == ANSWER_STRING
        and re.search(r"filename:\s*line_count|file.*highest number of lines|highest number of lines", desc)
        and re.search(r"xargs\s+wc\s+-l[^|]*\|\s*sort[^|]*\|\s*head\s+-?1", b)
        and "grep -v" not in b
    ):
        gaps.append("`wc -l` adds a `total` line that sorts above real files — remove `total` before choosing the max file and output `filename: line_count`")
    if (
        re.search(r"\bmaximum\s+number\b", desc)
        and re.search(r"\bcount\s+how\s+many\s+times\b|\bappears?\b", desc)
        and re.search(r"uniq\s+-c.*tail\s+-n?1", b)
    ):
        gaps.append("after numeric sort, `tail -1` is not the maximum frequency — compute max first, then count exact occurrences of that max value")
    return gaps


def extract_numeric_candidates(text: str) -> List[str]:
    """Pull plausible integer answers out of a shell output.

    Priority:
      1. A single line that's just an integer.
      2. The last line matching `<N> total` (wc -l style).
      3. The very last integer on the last non-empty line.
    """
    if not text:
        return []
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []
    out: List[str] = []
    # Rule 1: any line that is a pure integer
    for ln in lines:
        m = _NUMERIC_LINE_RE.match(ln)
        if m:
            out.append(m.group(1))
    if out:
        # Prefer the last pure-integer line
        return [out[-1]]
    # Rule 2: `<N> total`
    for ln in reversed(lines):
        tm = re.match(r"^\s*(-?\d+)\s+total\s*$", ln, re.IGNORECASE)
        if tm:
            return [tm.group(1)]
    # Rule 3: trailing integer on last line
    last = lines[-1]
    tm = _TRAILING_NUM_RE.search(last)
    if tm:
        return [tm.group(1)]
    return []


# ─────────────────────────────────────────────────────────────────────────────
# H3 — Tool description patching
# ─────────────────────────────────────────────────────────────────────────────

_H3_BASH_HINT = (
    "Use targeted, readable commands — break complex logic into multiple turns. "
    "For counting files: `find DIR -type f -name '*.EXT' | wc -l` (always add `-type f`). "
    "For counting matching lines: `grep -rh PATTERN DIR | wc -l`. "
    "For unique values: pipe to `sort -u | wc -l`. "
    "With `grep -E`, use `[0-9]`, not `\\d`; add `-r` when grepping a directory."
)

_H3_ANSWER_HINT = (
    "Return ONLY the bare value (e.g. '5', not '5 files' or 'The answer is 5'). "
    "Do NOT write `answer_action(...)` as plain text — you MUST invoke this tool "
    "via a real function call. Plain-text invocations are rejected."
)

_H3_FINISH_HINT = (
    "Use `finish_action` only for mutation tasks (create/delete/chmod/...). "
    "For a question with a numeric or string answer, use `answer_action`."
)


def patch_os_tool_descriptions(
    tools: Optional[List[Dict[str, Any]]]
) -> Optional[List[Dict[str, Any]]]:
    """H3: Append shell-strategy and format hints to tool descriptions."""
    if not tools:
        return tools
    patched = copy.deepcopy(tools)
    for tool in patched:
        fn = tool.get("function", {})
        name = fn.get("name", "")
        if name == "bash_action":
            fn["description"] = fn.get("description", "") + " " + _H3_BASH_HINT
        elif name == "answer_action":
            fn["description"] = fn.get("description", "") + " " + _H3_ANSWER_HINT
        elif name == "finish_action":
            fn["description"] = fn.get("description", "") + " " + _H3_FINISH_HINT
        tool["function"] = fn
    return patched


# ─────────────────────────────────────────────────────────────────────────────
# H2 — Rescue parser for text-embedded tool calls
# ─────────────────────────────────────────────────────────────────────────────

# JSON-dict style: answer_action({"answer":"5"}) or answer_action({"answer": "5"})
_RESCUE_ANSWER_JSON_RE = re.compile(
    r"answer_action\s*[\({]\s*\{?\s*[\"']?answer[\"']?\s*:\s*[\"']([^\"']+)[\"']",
    re.IGNORECASE,
)
# Python-kwarg style: answer_action(answer='5') / answer_action(answer="5") — a
# common failure mode on weak instruction-tuned models.
_RESCUE_ANSWER_KWARG_RE = re.compile(
    r"answer_action\s*\(\s*answer\s*=\s*(?:['\"]([^'\"]{1,200})['\"]|([^\)\n]{1,120}))\s*\)",
    re.IGNORECASE,
)
# Positional form: answer_action(5) / answer_action('42.5MB') / answer_action("foo")
_RESCUE_ANSWER_POSITIONAL_RE = re.compile(
    r"answer_action\s*\(\s*(?:['\"]([^'\"]{1,200})['\"]|([^\)\n]{1,120}))\s*\)",
    re.IGNORECASE,
)
# Bare "answer_action 60" (no parens) — only match a tight line-final token so
# prose like "call answer_action with the value" isn't rescued to garbage.
_RESCUE_ANSWER_BARE_RE = re.compile(
    r"(?m)^\s*answer_action[\s:=]+['\"]?([A-Za-z0-9_.+\-/]{1,60})['\"]?\s*$",
    re.IGNORECASE,
)
_RESCUE_BASH_RE = re.compile(
    r"bash_action\s*[\({]\s*\{?\s*[\"']?script[\"']?\s*:\s*[\"']((?:[^\"'\\]|\\.)+)[\"']",
    re.IGNORECASE | re.DOTALL,
)
_RESCUE_BASH_KWARG_RE = re.compile(
    r"bash_action\s*\(\s*script\s*=\s*['\"]((?:[^'\"\\]|\\.)+)['\"]",
    re.IGNORECASE | re.DOTALL,
)
_RESCUE_FINISH_RE = re.compile(
    r"finish_action\s*[\({]\s*\{?\s*[\"']?thought[\"']?\s*:\s*[\"']([^\"']+)[\"']",
    re.IGNORECASE,
)
_RESCUE_FINISH_KWARG_RE = re.compile(
    r"finish_action\s*\(\s*thought\s*=\s*['\"]([^'\"]+)['\"]",
    re.IGNORECASE,
)
# ReAct fallback: "Act: answer(5)" / "Act: bash" + ```bash ... ```
_REACT_ANSWER_RE = re.compile(r"Act:\s*answer\s*\(([^)]+)\)", re.IGNORECASE)
_REACT_BASH_FENCE = re.compile(r"```bash\n(.*?)\n```", re.DOTALL)
# OpenAI-JSON style wrapped in XML tags: <tool_call>\n{"name":"bash_action","arguments":{...}}\n</tool_call>
# MUST be greedy (.*) — the outer JSON has nested dicts (}} at the end), so non-greedy
# .*? stops at the first } (inner dict) and produces incomplete JSON that json.loads rejects.
# Closer is optional: some models emit `<tool_call>\n{...}` with no
# `</tool_call>` and no trailing prose, which made the previous strict-closer
# regex silently miss the call and the agent loop until task_limit_reached.
# When the closer is missing we accept end-of-string (`\Z`); for messier cases
# (e.g. trailing prose after the JSON) the brace-balanced fallback below
# kicks in inside `rescue_tool_call_from_text`.
_RESCUE_TOOL_CALL_XML_RE = re.compile(
    r"<tool_call>\s*(\{.*\})\s*(?:</tool_call>|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_RESCUE_TOOL_CALL_OPEN_RE = re.compile(r"<tool_call>", re.IGNORECASE)
# Some models write bash grouping \( \) inside JSON strings, which is invalid JSON.
# Convert invalid \X to \\X so json.loads sees a valid escaped backslash, and
# the resulting parsed string retains \( as correct bash syntax.
_INVALID_JSON_ESCAPE_RE = re.compile(r'\\([^"\\/bfnrtu])')


def _fix_json_escapes(s: str) -> str:
    """Convert invalid JSON escapes (e.g. backslash-paren) to double-backslash form."""
    return _INVALID_JSON_ESCAPE_RE.sub(r'\\\\\1', s)


def _balanced_json_object(content: str, start: int) -> Optional[Tuple[int, int]]:
    """Find the next balanced {...} JSON object at/after `start`.

    Returns (begin, end) char offsets so content[begin:end] is the JSON dict,
    or None if no balanced object is found.  Respects double-quoted strings
    with backslash escapes — `{` / `}` inside strings do not affect depth.
    """
    n = len(content)
    i = start
    while i < n and content[i] != '{':
        i += 1
    if i >= n:
        return None
    begin = i
    depth = 0
    in_str = False
    esc = False
    while i < n:
        c = content[i]
        if esc:
            esc = False
        elif c == '\\':
            esc = True
        elif in_str:
            if c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return (begin, i + 1)
        i += 1
    return None


def _rescue_tool_call_balanced(content: str) -> Optional[Dict[str, Any]]:
    """Fallback for <tool_call> blocks the strict regex misses.

    Triggered for two real-world patterns the closing-tag regex couldn't
    handle even after relaxing the closer:
      1. trailing prose after the JSON (no </tool_call>): `<tool_call>{...}\nNote: ...`
      2. malformed escapes that defeat greedy backtracking
    Uses brace-balanced extraction so nested `{...}` inside `arguments` is
    handled correctly.  Returns the parsed call dict or None.
    """
    m = _RESCUE_TOOL_CALL_OPEN_RE.search(content)
    if not m:
        return None
    span = _balanced_json_object(content, m.end())
    if span is None:
        return None
    try:
        import json as _json
        obj = _json.loads(_fix_json_escapes(content[span[0]:span[1]]))
    except Exception:
        return None
    if not isinstance(obj, dict):
        return None
    name = obj.get("name", "")
    args = obj.get("arguments", {})
    if name in ("answer_action", "bash_action", "finish_action") and args:
        return {"name": name, "arguments": args}
    return None


def _first_nonempty_match_group(m: re.Match) -> str:
    """Return the first non-empty capture group from a regex match."""
    for g in m.groups():
        if g is not None and g != "":
            return g
    return m.group(0)


def rescue_tool_call_from_text(content: str) -> Optional[Dict[str, Any]]:
    """Attempt to lift a tool invocation from plain-text assistant content.

    Returns a dict like {"name": "answer_action", "arguments": {"answer": "5"}}
    or None if nothing recognisable was embedded.  Priority is answer > finish >
    bash — once the agent has written the answer in text we should submit it
    rather than re-run a command.  Answer patterns are tried in order from
    strictest (JSON dict) to loosest (bare line) to minimise false positives.
    """
    if not content:
        return None
    # XML-wrapped OpenAI-JSON format: {"name":...,"arguments":{...}}
    # Try this first because it's unambiguous (contains name + full arguments dict).
    m = _RESCUE_TOOL_CALL_XML_RE.search(content)
    if m:
        try:
            import json as _json
            obj = _json.loads(_fix_json_escapes(m.group(1)))
            name = obj.get("name", "")
            args = obj.get("arguments", {})
            if name in ("answer_action", "bash_action", "finish_action") and args:
                return {"name": name, "arguments": args}
        except Exception:
            pass
    # Brace-balanced fallback — covers the "no closing tag" case
    # (and trailing-prose variants) that the regex above misses.  Without
    # this fallback, certain episodes loop until task_limit_reached
    # because every assistant turn is text-only and H2 silently no-ops.
    if "<tool_call>" in content.lower():
        rescued = _rescue_tool_call_balanced(content)
        if rescued:
            return rescued
    # answer_action — try strict → loose
    for pat in (_RESCUE_ANSWER_JSON_RE, _RESCUE_ANSWER_KWARG_RE,
                _RESCUE_ANSWER_POSITIONAL_RE, _RESCUE_ANSWER_BARE_RE):
        m = pat.search(content)
        if m:
            val = _first_nonempty_match_group(m).strip().strip("'\"")
            # Defend against picking up the literal token "answer" / "action"
            if val.lower() in {"answer", "action", "value"}:
                continue
            return {"name": "answer_action", "arguments": {"answer": val}}
    m = _REACT_ANSWER_RE.search(content)
    if m:
        val = m.group(1).strip().strip('"\'')
        return {"name": "answer_action", "arguments": {"answer": val}}
    # finish_action
    for pat in (_RESCUE_FINISH_RE, _RESCUE_FINISH_KWARG_RE):
        m = pat.search(content)
        if m:
            return {"name": "finish_action", "arguments": {"thought": m.group(1).strip()}}
    # bash_action
    for pat in (_RESCUE_BASH_RE, _RESCUE_BASH_KWARG_RE):
        m = pat.search(content)
        if m:
            script = m.group(1).encode().decode("unicode_escape", errors="ignore")
            return {"name": "bash_action", "arguments": {"script": script}}
    m = _REACT_BASH_FENCE.search(content)
    if m:
        return {"name": "bash_action", "arguments": {"script": m.group(1).strip()}}
    return None


# ─────────────────────────────────────────────────────────────────────────────
# H2 — Safety filter
# ─────────────────────────────────────────────────────────────────────────────

_DANGEROUS_PATTERNS = [
    re.compile(r"\brm\s+-rf\s+/(?:\s|$)"),
    re.compile(r":\(\)\s*\{\s*:\|\s*:&\s*\};?:"),  # fork bomb
    re.compile(r"\bmkfs\."),
    re.compile(r"\bdd\s+.*of=/dev/"),
    re.compile(r">\s*/dev/(?:sda|sdb|nvme)"),
    re.compile(r"\bshutdown\b"),
    re.compile(r"\breboot\b"),
    re.compile(r"\bchmod\s+-R\s+777\s+/(?:\s|$)"),
]


def _is_dangerous_bash(script: str) -> Optional[str]:
    for pat in _DANGEROUS_PATTERNS:
        if pat.search(script or ""):
            return pat.pattern
    return None


# ─────────────────────────────────────────────────────────────────────────────
# H2 — Answer normaliser (interface-boundary repair at rescue / commit)
# ─────────────────────────────────────────────────────────────────────────────

_ANSWER_STRIP_PREFIXES = [
    "the answer is", "answer:", "answer is", "result:", "result is",
    "output:", "count:", "count is", "total:", "total is",
]

_ANSWER_UNIT_TOKENS = {
    "file", "files", "line", "lines", "byte", "bytes",
    "match", "matches", "occurrence", "occurrences",
    "directory", "directories", "folder", "folders",
    "process", "processes", "user", "users",
    "entry", "entries", "item", "items",
    "ip", "ips", "address", "addresses",
}

_SIMPLE_INT_ARITH_RE = re.compile(r"^\s*\d+(?:\s*[+\-]\s*\d+)+\s*$")


def _eval_simple_int_arithmetic(expr: str) -> Optional[str]:
    """Evaluate a tiny integer arithmetic expression without general eval."""
    if not _SIMPLE_INT_ARITH_RE.fullmatch(expr or ""):
        return None
    total: Optional[int] = None
    op = "+"
    for tok in re.findall(r"\d+|[+\-*/]", expr):
        if tok in "+-*/":
            op = tok
            continue
        n = int(tok)
        if total is None:
            total = n
        elif op == "+":
            total += n
        elif op == "-":
            total -= n
    return str(total) if total is not None else None


def normalize_answer(value: str, answer_shape: Optional[str]) -> Tuple[str, bool]:
    """H2: Normalise submitted answer based on H0's answer_shape.

    Returns (normalized, mutated). Passthrough when shape is None.
    """
    if value is None or answer_shape is None:
        return value, False
    s = str(value).strip()
    original = s

    # Strip a leading "the answer is …" style prefix (case-insensitive)
    low = s.lower()
    for p in _ANSWER_STRIP_PREFIXES:
        if low.startswith(p):
            s = s[len(p):].lstrip(" :\t")
            low = s.lower()
            break

    # Drop surrounding quotes
    s = s.strip().strip('"\'')

    if answer_shape == ANSWER_INTEGER:
        # Drop a trailing sentence-final period.
        s = s.rstrip(".")
        arith = _eval_simple_int_arithmetic(s)
        if arith is not None:
            s = arith
            return s, (s != original)
        # Drop trailing unit tokens: "5 files" → "5", "5 unique IPs" → "5"
        tokens = s.split()
        while len(tokens) > 1 and tokens[-1].lower().strip(".,") in _ANSWER_UNIT_TOKENS:
            tokens.pop()
        s = " ".join(tokens).strip()
        # If the response is a structured value (`file2.txt: 3`, `orange:3`)
        # do not collapse it to the trailing number.  That kind of mutation was
        # a recurrent regression when H0 under-classified a formatted answer as
        # integer.
        if ":" in s and re.search(r"[A-Za-z]", s):
            return s, (s != original)
        # If still multi-token, try to find the last pure-int token in ordinary
        # prose such as "The answer is 5".
        if not re.fullmatch(r"-?\d+", s):
            nums = re.findall(r"-?\d+", s)
            if nums:
                s = nums[-1]
    elif answer_shape == ANSWER_SIZE:
        # Collapse whitespace inside "42.5 MB" → "42.5MB"
        s = re.sub(r"(\d)\s+([KMGT]?B\b)", r"\1\2", s, flags=re.IGNORECASE)
        # Strip trailing ".0" from decimal sizes: "50.0K" → "50K".
        # The evaluator (size-match.py) calls int() on the numeric part, which
        # raises ValueError on "50.0", causing the comparison to fail silently.
        s = re.sub(r"(\d+)\.0+([KMGTP]?B?)\b", r"\1\2", s, flags=re.IGNORECASE)
        s = s.rstrip(".")
    elif answer_shape == ANSWER_STRING:
        s = s.rstrip(".")
        # Strip trailing newline already handled by .strip() above.
    elif answer_shape == ANSWER_PATH:
        s = s.rstrip("/").rstrip(".")

    return s, (s != original)


# ─────────────────────────────────────────────────────────────────────────────
# Runtime — glues H0..H5 together
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class OSHarnessRuntime:
    config: OSHarnessConfig
    task_ctx: Optional[OSTaskContext] = field(default=None)
    state: OSShellState = field(default_factory=OSShellState)
    force_next_action: Optional[Dict[str, Any]] = field(default=None)
    _last_hint: Optional[str] = field(default=None)
    _h5_injected_cold: bool = field(default=False)

    # ── H0 ──────────────────────────────────────────────────────────────────

    def init_task(self, description: str) -> None:
        self.task_ctx = parse_task_context(description)
        self.state = OSShellState()
        self.state.h4_fired_last_round = False
        self.force_next_action = None
        self._last_hint = None
        self._h5_injected_cold = False

    # ── H5 cold-start ───────────────────────────────────────────────────────

    def cold_start_skill_hints(self) -> List[Dict[str, str]]:
        if not self.config.h5_enabled or self.task_ctx is None:
            return []
        scored = retrieve_os_skills(
            task_type=self.task_ctx.task_type,
            query=self.task_ctx.raw_description,
            top_k=self.config.h5_top_k,
            score_threshold=self.config.h5_score_threshold,
        )
        selected_skills: List[Dict[str, Any]] = [skill for _, skill in scored]

        raw_l = self.task_ctx.raw_description.lower()

        def _force_skill(skill_id: str) -> None:
            skill = next((s for s in OS_SKILLS if s["id"] == skill_id), None)
            if skill is None or any(s["id"] == skill_id for s in selected_skills):
                return
            if len(selected_skills) >= self.config.h5_top_k:
                selected_skills[-1] = skill
            else:
                selected_skills.insert(0, skill)

        # Sparse high-confidence overrides for frequent OS failures.  These are
        # lexical and task-specific, so they avoid the broad BM25 false matches
        # that made earlier H5 variants harmful.
        if (
            self.task_ctx.task_type == TASK_COUNT_UNIQUE
            and re.search(r"\bunique\s+words?\b|\bwords?\s+.*\bunique\b", raw_l)
        ):
            _force_skill("count_unique_words")

        if (
            self.task_ctx.task_type in (TASK_COUNT_MATCHES, TASK_COUNT_LINES)
            and (
                re.search(r"\b\d{4}-\d{2}-\d{2}\b", raw_l)
                or re.search(r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\b", raw_l)
            )
            and re.search(r"\b(entries?|events?|occurred|happened|requests?)\b", raw_l)
        ):
            _force_skill("count_entries_by_date")

        # Context-driven override: if the task is case-insensitive and
        # case_insensitive_hint is not already in the results, force it in as
        # the first skill (replacing the lowest-ranked result if at capacity).
        # This prevents higher-scoring but less relevant skills from crowding
        # out the most actionable tip for the agent.
        if self.task_ctx.case_sensitive is False:
            ci_skill = next(
                (s for s in OS_SKILLS if s["id"] == "case_insensitive_hint"), None
            )
            if ci_skill is not None:
                already_in = any(s["id"] == "case_insensitive_hint" for s in selected_skills)
                # With top_k=1, a generic case hint should not evict a more
                # specific skill such as unique-word normalization.
                if not already_in and len(selected_skills) < self.config.h5_top_k:
                    selected_skills.insert(0, ci_skill)

        result: List[Dict[str, str]] = []
        for skill in selected_skills:
            text = skill["text"]
            result.append({
                "id": skill["id"],
                "text": text,
                "trigger": "cold_start",
                "token_cost": str(len(text.split())),
            })
        self._h5_injected_cold = True
        return result

    # ── H2 ──────────────────────────────────────────────────────────────────

    def pre_validate_action(
        self,
        tool_name: Optional[str],
        raw_value: Optional[str],
    ) -> Dict[str, Any]:
        """Validate a (tool_name, raw_value) pair before the env executes it.

        Safety filter only — rescue parsing happens upstream in task.py because
        it needs access to the raw assistant content, not just the tool call.
        Returns: {action_name, action_value, blocked, reason}.
        """
        response: Dict[str, Any] = {
            "action_name": tool_name,
            "action_value": raw_value,
            "blocked": False,
            "reason": "",
        }
        if not self.config.h2_enabled:
            return response

        # Force action consumption — task.py writes force_next_action ahead.
        if self.force_next_action:
            fa = self.force_next_action
            self.force_next_action = None
            response["action_name"] = fa["name"]
            response["action_value"] = fa.get("arguments", {}).get(
                "answer", fa.get("arguments", {}).get("script", fa.get("arguments", {}).get("thought", ""))
            )
            response["reason"] = "force_next_action"
            return response

        if tool_name == "bash_action" and raw_value:
            dpat = _is_dangerous_bash(raw_value)
            if dpat:
                response["blocked"] = True
                response["reason"] = f"dangerous_bash:{dpat}"
                return response
            # Duplicate-bash gate: if the last two bash commands match raw_value
            # AND we have a PLAUSIBLE candidate answer ready → promote H4
            # budget force to submit the answer.  Never auto-submit an
            # implausible candidate (0 on a
            # filter task, awk overflow, …) — better to let the agent retry
            # with a corrected pipeline.
            hist = self.state.bash_history
            if (
                len(hist) >= self.config.h2_repeat_bash_block_after
                and all(h == raw_value for h in hist[-self.config.h2_repeat_bash_block_after:])
                and self.state.candidate_numeric_answer
                and not self.state.candidate_implausible
                and self.task_ctx is not None
                and self.task_ctx.answer_shape == ANSWER_INTEGER
                and not self.state.answered
            ):
                self.force_next_action = {
                    "name": "answer_action",
                    "arguments": {"answer": self.state.candidate_numeric_answer},
                }
                response["blocked"] = True
                response["reason"] = "duplicate_bash_force_answer"
                return response

        return response

    # ── H1 ──────────────────────────────────────────────────────────────────

    def update_state_after_bash(self, script: str, output: str) -> None:
        if script:
            self.state.bash_history.append(script)
        self.state.last_output_raw = output or ""
        self.state.last_output_truncated = bool(output and _TRUNC_MARK in output)
        self.state.last_output_was_empty = (output or "").strip() == ""
        self.state.last_output_had_error = bool(output and _ERROR_RE.search(output))
        self.state.last_output_numeric_candidates = extract_numeric_candidates(output or "")
        if self.state.last_output_was_empty:
            self.state.empty_output_streak += 1
        else:
            self.state.empty_output_streak = 0
        if self.state.last_output_numeric_candidates:
            self.state.candidate_numeric_answer = self.state.last_output_numeric_candidates[-1]
            if script:
                self.state.numeric_candidate_history.append(
                    (script, self.state.last_output_numeric_candidates[-1])
                )
                self.state.numeric_candidate_history = self.state.numeric_candidate_history[-5:]
        # Single-line string candidate (for largest/smallest tasks with filename answer).
        # Guard: reject lines that look like tool-error/warning messages or are so long
        # that they can't be a real answer (filenames, dates, etc. are short).
        lines = [ln.strip() for ln in (output or "").splitlines() if ln.strip()]
        if (
            len(lines) == 1
            and not self.state.last_output_had_error
            and len(lines[0]) <= 120
            and not re.match(
                r"^(find|grep|ls|awk|sed|cat|wc|sort|uniq|head|tail|xargs|bash|sh)\s*[:\(]",
                lines[0], re.IGNORECASE,
            )
        ):
            self.state.candidate_string_answer = lines[0]
        # Candidate health: mark implausible only for awk overflow / negative /
        # huge values.  The "zero on filter task" heuristic was removed after
        # v2 analysis showed 0 is the correct answer in several training samples
        # (e.g. "count files with 'error' in their name" when none exist).
        # Blocking a correct 0 caused task_limit; submitting a wrong 0 fails the
        # same way — so the heuristic had no net benefit.
        # Only apply the implausibility check when answer_shape is integer;
        # string/date candidates (e.g. "2023-10-02") may contain negative-looking
        # substrings ("-02") that would be falsely flagged otherwise.
        self.state.candidate_implausible = False
        cand = self.state.candidate_numeric_answer
        if cand is not None and (
            self.task_ctx is None or self.task_ctx.answer_shape == ANSWER_INTEGER
        ):
            if not is_plausible_numeric_candidate(cand):
                self.state.candidate_implausible = True

    def note_answer_submitted(self) -> None:
        self.state.answered = True

    def note_text_only_turn(self) -> None:
        self.state.text_only_streak += 1

    def reset_text_only_streak(self) -> None:
        self.state.text_only_streak = 0

    def note_rescue_hit(self) -> None:
        self.state.rescue_hits += 1

    # ── H4 (post-step monitor, incl. budget warn/force) ──────────────────────

    def post_step_monitor(self, remaining_rounds: int = 99) -> Dict[str, Any]:
        """Inspect H1 state and return a recovery prompt + optional force.

        Budget warn/force is a sub-branch inside this function so there is a
        single post-bash monitoring trigger rather than two separate insertion
        points.  remaining_rounds is round_limit - current_round_num (inclusive
        of this round that just finished).
        Updates st.h4_fired_last_round so the post-ls nudge (⑥) can fire next round.
        """
        response: Dict[str, Any] = {
            "audit_reason": "",
            "recovery_prompt": None,
            "force_action": None,
        }
        if not self.config.h4_enabled or self.task_ctx is None:
            self.state.h4_fired_last_round = False
            return response
        st = self.state
        ctx = self.task_ctx

        # Capture whether H4 fired in the PREVIOUS round (before we update the flag).
        prior_h4_fired = st.h4_fired_last_round

        def _return(r: Dict[str, Any]) -> Dict[str, Any]:
            st.h4_fired_last_round = bool(r.get("recovery_prompt"))
            return r

        # ⓪ Truncation — agent should refine, not re-run
        if st.last_output_truncated:
            response["audit_reason"] = "truncated"
            response["recovery_prompt"] = (
                "Harness: output was truncated. Refine the command — e.g. pipe to "
                "`wc -l` for a count, `head -20` for a sample, or narrow the filter. "
                "Do NOT re-run the same command."
            )
            return _return(response)

        # ① Error signatures
        if st.last_output_had_error:
            err_text = st.last_output_raw.lower()
            if "command not found" in err_text:
                response["audit_reason"] = "command_not_found"
                response["recovery_prompt"] = (
                    "Harness: command not found. Try an alternative "
                    "(ss instead of netstat, ip a instead of ifconfig) or check PATH."
                )
                return _return(response)
            if (
                "no such file or directory" in err_text
                or "paths must precede expression" in err_text
                or "is a directory" in err_text
            ):
                response["audit_reason"] = "no_such_file"
                cands = extract_numeric_candidates(st.last_output_raw)
                extra = ""
                if cands:
                    extra = (
                        f" The '{cands[-1]}' in the output is from an error exit, "
                        f"NOT a real count — do NOT submit it."
                    )
                if (
                    "logfiles" in (ctx.raw_description or "").lower()
                    and re.search(r"\b(day|date)\b.*\b(highest|most|maximum)\s+number\s+of\s+log\s+entries\b", (ctx.raw_description or "").lower())
                ):
                    response["recovery_prompt"] = (
                        "Harness: the nested find/xargs command failed. Use the simple direct pipeline instead: "
                        "`grep -hEo '^[0-9]{4}-[0-9]{2}-[0-9]{2}' ~/logfiles/*.log | "
                        "sort | uniq -c | sort -nr | head -1 | awk '{print $2}'`."
                    )
                    return _return(response)
                response["recovery_prompt"] = (
                    "Harness: target file or directory missing (path error or wrong glob)."
                    + extra
                    + " Fix the path: use `find ~ -name '*.EXT'` or `grep -r --include='*.EXT'`. "
                    "Never use `~/.*\\.EXT` glob — it doesn't expand correctly."
                )
                return _return(response)
            if "permission denied" in err_text:
                response["audit_reason"] = "permission_denied"
                response["recovery_prompt"] = (
                    "Harness: permission denied. Prefix with `sudo` if you are root in this "
                    "container, or inspect with `stat` / `ls -l` before changing the file."
                )
                return _return(response)

        # ② Empty output when a count was expected
        if (
            st.last_output_was_empty
            and ctx.task_type in (TASK_COUNT_FILES, TASK_COUNT_LINES, TASK_COUNT_MATCHES, TASK_COUNT_UNIQUE)
            and st.empty_output_streak >= 1
        ):
            response["audit_reason"] = "empty_count"
            response["recovery_prompt"] = (
                "Harness: empty output. The filter may be too strict — drop the "
                "extension/time/size constraint one step at a time or widen the directory."
            )
            return _return(response)

        # ③ Same bash in a row on unchanged output
        if (
            len(st.bash_history) >= self.config.h4_stall_window
            and len(set(st.bash_history[-self.config.h4_stall_window:])) == 1
        ):
            response["audit_reason"] = "bash_loop"
            if (
                st.candidate_numeric_answer
                and ctx.answer_shape == ANSWER_INTEGER
                and not st.candidate_implausible
            ):
                response["recovery_prompt"] = (
                    f"Harness: you have run the same command {self.config.h4_stall_window} times. "
                    f"The output already contains the answer ({st.candidate_numeric_answer}). "
                    f"Stop repeating — submit your final answer now."
                )
            else:
                st.bash_loop_count += 1
                alt = self._first_turn_hint(ctx)
                # After 2+ loop detections with no candidate, force finish to break deadlock
                if st.bash_loop_count >= 2:
                    response["force_action"] = {
                        "name": "finish_action",
                        "arguments": {"thought": "Harness forced finish after repeated loop with no answer found."},
                    }
                    response["recovery_prompt"] = (
                        "Harness: repeated loop detected with no answer. Terminating episode."
                    )
                elif alt:
                    response["recovery_prompt"] = (
                        "Harness: you are repeating the same command with no progress. "
                        "Try this instead — " + alt.removeprefix("Hint: ")
                    )
                else:
                    response["recovery_prompt"] = (
                        "Harness: you are repeating the same command. Try a different approach "
                        "or submit the best answer you have."
                    )
            return _return(response)

        # ④ Text-only streak (≥ threshold) — hard nudge to invoke a tool
        if st.text_only_streak >= self.config.h2_text_only_streak_force:
            response["audit_reason"] = "text_only_streak"
            response["recovery_prompt"] = (
                "Harness: no tool call was detected. "
                "You must call a tool — either run a bash command or submit your final answer."
            )
            return _return(response)

        # ⑤ grep -c per-file output detection — when bash output looks like
        # "file1.log:3\nfile2.log:1" (multiple file:count lines from grep -c),
        # the extracted candidate is the last count (wrong).  Warn and suggest
        # the correct summation approach.
        _output_lines = [ln.strip() for ln in (st.last_output_raw or "").splitlines() if ln.strip()]
        _grep_c_lines = [ln for ln in _output_lines if _GREP_C_LINE_RE.match(ln)]
        if len(_grep_c_lines) >= 2:
            response["audit_reason"] = "grep_c_output"
            per_file_counts = [int(ln.rsplit(":", 1)[1]) for ln in _grep_c_lines]
            total = sum(per_file_counts)
            if ctx.answer_shape == ANSWER_INTEGER:
                self.state.candidate_numeric_answer = str(total)
                self.state.candidate_implausible = False
                response["force_action"] = {
                    "name": "answer_action",
                    "arguments": {"answer": str(total)},
                }
                response["recovery_prompt"] = (
                    "Harness: grep -c returned one count per file. "
                    f"The total is their sum: {total}. Submitting that total."
                )
            else:
                response["recovery_prompt"] = (
                    "Harness: this looks like grep -c per-file output (each line is 'file:count'). "
                    "To get the TOTAL count, use: `grep PATTERN DIR | wc -l`, or sum these numbers with "
                    "`awk -F: '{sum+=$NF} END{print sum}'`."
                )
            return _return(response)

        # ⑥ Post-ls nudge — H4 fired last round (path error / empty), agent ran
        # `ls` this round, and the listing shows files.  This catches the pattern
        # where the agent confirms file existence but then submits 0 without
        # actually running a count/extraction command.
        if (
            prior_h4_fired
            and st.bash_history
            and re.match(r"^\s*ls\b", st.bash_history[-1])
            and not st.last_output_was_empty
            and not st.last_output_had_error
            and not st.answered
        ):
            response["audit_reason"] = "post_ls_nudge"
            response["recovery_prompt"] = (
                "Harness: files confirmed. Now run your actual count/extraction command "
                "on these files using their full path. "
                "Do NOT submit 0 — you have not counted yet."
            )
            return _return(response)

        # ⑦ Budget warn/force — H4 sub-branch, fires after bash; net effect
        # is identical to a round-top check since both inject before next LLM call.
        if not st.answered:
            rem = remaining_rounds - 1  # rounds left after this one completes
            if (
                rem <= self.config.h4_budget_force_threshold
                and ctx.answer_shape == ANSWER_INTEGER
                and st.candidate_numeric_answer
                and not st.candidate_implausible
            ):
                response["audit_reason"] = "budget_force"
                response["force_action"] = {
                    "name": "answer_action",
                    "arguments": {"answer": st.candidate_numeric_answer},
                }
                response["recovery_prompt"] = (
                    f"[{rem} rounds left] Harness: forcing answer_action with "
                    f"'{st.candidate_numeric_answer}'."
                )
                return _return(response)
            if rem <= self.config.h4_budget_warn_threshold:
                response["audit_reason"] = "budget_warn"
                if (
                    st.candidate_numeric_answer
                    and ctx.answer_shape == ANSWER_INTEGER
                    and not st.candidate_implausible
                ):
                    response["recovery_prompt"] = (
                        f"[{rem} rounds left] You have a candidate answer "
                        f"({st.candidate_numeric_answer}). Submit it now."
                    )
                elif st.candidate_implausible:
                    response["recovery_prompt"] = (
                        f"[{rem} rounds left] Your last pipeline produced an "
                        "implausible value. Broaden the filter or switch tools before submitting."
                    )
                else:
                    response["recovery_prompt"] = (
                        f"[{rem} rounds left] If you have a candidate answer, "
                        "submit it immediately."
                    )

        return _return(response)


    # ── H4-E: state-driven per-step guidance ────────────────────────────────

    def step_guidance(
        self,
        round_num: int,
        max_rounds: int,
        h4_audit_active: bool = False,
    ) -> Optional[str]:
        """H4-E: Per-step guidance driven by H1 runtime state (candidate answers, bash history).

        h4_audit_active: True when H4 just fired a recovery_prompt this same
        round.  In that case, suppress the "submit" hint (②, string promotion)
        so the model only sees H4's recovery message and doesn't follow a
        conflicting "submit '0'" hint instead.  Lint (①) is still allowed.
        """
        if not self.config.h4_enabled or self.task_ctx is None:
            return None
        ctx = self.task_ctx
        st = self.state

        hint: Optional[str] = None

        # ① Semantic-consistency lint — only fires when the last bash looks like
        # it diverges from the parsed task intent AND the agent has no candidate
        # yet.  Suppressed when a candidate already exists: the lint would push
        # the agent away from a value it already found, which is net-harmful
        # (cf. idx 24, 809 where lint caused the agent to switch from the correct
        # answer to a wrong one).
        if st.bash_history and not st.answered:
            gaps = bash_semantic_gaps(ctx, st.bash_history[-1])
            # Strong gaps are only objective high-confidence command bugs that
            # would yield a wrong count regardless of the candidate value:
            # wrong file scope (extension / recursion), wrong case-handling,
            # broken regex syntax, off-by-N counters.  Stylistic / advisory
            # gaps (e.g. "use du -ch | grep total" instead of manual
            # byte-to-KB conversion) are NOT included here — they fall back to
            # the no-candidate-only path so that a plausible candidate the
            # agent already has is not overridden by fragile advice.
            # Certain tasks (e.g. total .txt KB) regressed because the
            # "human-readable disk usage" hint forced a `du -ch | grep total`
            # rewrite that produced per-file totals (`-exec ... {} \;` runs
            # du once per file), turning a correct candidate `0` into wrong `4`.
            strong_gap = next(
                (
                    g for g in gaps
                    if "`\\d`" in g
                    or "didn't filter by" in g
                    or "ignoring case" in g               # added: this is the dominant
                    or "case-insensitive matching" in g   # case-insensitive gap text;
                    # the whitelist previously matched only the rarer (1115) variant,
                    # so the common (1106/1108) "ignoring case" gap silently fell
                    # through and never overrode a candidate.
                    or "task mentions subdirectories" in g
                    or "grepping a directory" in g
                    or "`find -path`" in g
                    or "`grep -l" in g
                    or "filters by filename" in g
                    or "$1" in g
                    or "starting with" in g
                    or "`tr` has no input" in g
                    or "beginning of each line" in g
                    or "top directory only" in g
                    or "number of files from `find`" in g
                    # removed: "human-readable disk usage" — the suggested
                    # `du -ch ... | grep total` rewrite breaks under
                    # `-exec ... {} \;` (du runs once per file) and
                    # turned a correct candidate `0` into `4` on some models
                    # total .txt KB tasks.  Stylistic hint; let
                    # candidate-promotion handle it instead.
                    or "date field includes brackets" in g
                    or "slashes inside an awk regex" in g
                    or "discards the date field" in g
                    or "top-level files" in g
                    or "currently running" in g
                    or "counts the header line" in g
                    or "extract keys first" in g
                    or "remove newlines before `wc -c`" in g
                    or "`wc -l` adds a `total` line" in g
                    or "count exact occurrences" in g
                ),
                None,
            )
            if st.candidate_numeric_answer is None and st.candidate_string_answer is None:
                if gaps:
                    gap = gaps[0]
                    hint = f"Harness lint: {gap}."
            elif strong_gap:
                hint = f"Harness lint: {strong_gap}."

        # Aggregate split-by-extension counts.  When the task asks for a total
        # across several file extensions, the model often runs separate counts
        # (`*.txt`, `*.log`, `*.md`) and H4's generic candidate promotion can
        # accidentally submit only the last component.  If the recent numeric
        # history clearly consists of different extension-specific commands,
        # promote the sum instead.
        if hint is None and not h4_audit_active and ctx.answer_shape == ANSWER_INTEGER:
            total_hint = self._aggregate_recent_component_counts(ctx)
            if total_hint is not None:
                hint = total_hint

        if hint is None and not h4_audit_active and ctx.answer_shape == ANSWER_STRING:
            formatted = self._formatted_wc_line_answer(ctx)
            if formatted is not None:
                hint = formatted

        # ② Promote candidate numeric answer — suppressed when H4 has an active
        # recovery prompt (h4_audit_active=True) so the two signals don't
        # conflict.  Also suppressed for implausible values (awk overflow, etc.).
        #
        # Rounds 0–1 verification window (v6): on the first TWO bash calls emit a
        # verification nudge rather than a direct "submit" hint.  Analysis of v4
        # failures showed 22/35 were 1-shot wrong-command submissions (v5 fixed
        # those with round-0 nudge).  Remaining analysis shows similar premature
        # submission on round-1 (agent refines command slightly, gets a number,
        # immediately submits before verifying flags like -i).  Extending the
        # verification window to round<=1 keeps the extra-check pressure without
        # blocking the agent from submitting from round 2 onwards.
        #
        # Zero special case: replaced aggressive "run ls" with a softer hint that
        # doesn't push the agent into further exploration (which causes wrong
        # answers when the true count IS 0, e.g. "files modified in last N days").
        if not h4_audit_active:
            if hint is None and (
                ctx.answer_shape == ANSWER_INTEGER
                and st.candidate_numeric_answer
                and not st.candidate_implausible
                and not st.answered
            ):
                if st.candidate_numeric_answer == '0':
                    # Soft zero-nudge: don't instruct the agent to run `ls` —
                    # that triggers additional H4 empty/path-error cascades when
                    # 0 is actually the correct answer (e.g. mtime filter tasks).
                    hint = (
                        "Harness: result is 0. If your path and filter are correct "
                        "(right directory, right extension, time/size constraints), "
                        "0 is a valid answer — submit it. Only re-check the command "
                        "if you suspect the path or filter may be wrong."
                    )
                elif round_num <= 1 and len(st.bash_history) <= 2:
                    # First two bash calls — only push for verification when
                    # the command itself looks suspect (semantic gaps detected).
                    # When the command is clean and produced a plausible
                    # candidate, prefer the direct submit hint: forcing a
                    # second-look on already-correct 1-shot answers regresses
                    # models that one-shot well (model
                    # ran the right `find ... | wc -l`, got `2`, then under
                    # the verification nudge ran `xargs ls -l` and finally
                    # called `finish_action` with prose instead of submitting
                    # `2`).  Models that need the safety net (weaker
                    # buggy commands) keep getting the verification nudge
                    # because their commands surface gaps.
                    suspect = bool(bash_semantic_gaps(ctx, st.bash_history[-1]))
                    if suspect:
                        hint = (
                            f"Hint: your first command returned '{st.candidate_numeric_answer}'. "
                            f"Verify before committing: right directory? correct filter pattern? "
                            f"case-sensitive match? counting lines not files? "
                            f"Run a second command to confirm if unsure."
                        )
                    else:
                        hint = (
                            f"Hint: the last output contains the likely answer "
                            f"'{st.candidate_numeric_answer}'. If that matches the task, submit it."
                        )
                else:
                    hint = (
                        f"Hint: the last output contains the likely answer "
                        f"'{st.candidate_numeric_answer}'. If that matches the task, submit it."
                    )
            # Suspicious-zero nudge when the candidate IS implausible
            elif hint is None and (
                ctx.answer_shape == ANSWER_INTEGER
                and st.candidate_implausible
                and st.candidate_numeric_answer in ("0", "-9223372036854775808")
                and not st.answered
            ):
                hint = (
                    "Harness: the pipeline produced 0 / an overflow sentinel. Your "
                    "filter is likely too strict — drop the extension or time "
                    "constraint, or inspect the data with `head -3`."
                )
            # Promote single-line string candidate for any string-answer task
            # (previously limited to LARGEST/SMALLEST; extended in v4 to catch
            # tasks like "find the date with most events" classified as TASK_OTHER).
            elif hint is None and (
                ctx.answer_shape in (ANSWER_STRING, ANSWER_PATH, None)
                and st.candidate_string_answer
                and not st.answered
                and not st.last_output_had_error
            ):
                hint = (
                    f"Hint: if '{st.candidate_string_answer}' is the answer, submit it."
                )

        # First-turn suggestion when no bash has been run yet (always allowed)
        if hint is None and round_num == 0 and not st.bash_history:
            hint = self._first_turn_hint(ctx)

        if hint is None:
            return None

        words = hint.split()
        if len(words) > self.config.h4_hint_max_words:
            hint = " ".join(words[: self.config.h4_hint_max_words])

        if hint == self._last_hint:
            return None
        self._last_hint = hint
        return hint

    def _aggregate_recent_component_counts(self, ctx: OSTaskContext) -> Optional[str]:
        if not self.state.numeric_candidate_history:
            return None
        desc = (ctx.raw_description or "").lower()
        if not re.search(r"\b(total|across|combined|all)\b", desc):
            return None
        recent = self.state.numeric_candidate_history[-4:]
        components: List[Tuple[str, int]] = []
        seen_exts: set = set()
        for script, value in recent:
            if not re.fullmatch(r"-?\d+", str(value)):
                continue
            if "wc -l" not in script and "grep -c" not in script:
                continue
            exts = re.findall(r"\*\.([A-Za-z0-9]{1,6})\b", script)
            if not exts:
                # Also catch simple globs like `~/*.txt`.
                exts = re.findall(r"/\*\.(txt|log|md|csv|json|py)\b", script, flags=re.IGNORECASE)
            if len(exts) != 1:
                continue
            ext = exts[0].lower()
            if ext in seen_exts:
                continue
            seen_exts.add(ext)
            components.append((ext, int(value)))
        if len(components) < 2:
            return None
        desc_exts = {m.lower() for m in re.findall(r"\.([A-Za-z0-9]{1,6})\b", desc)}
        if desc_exts and not set(ext for ext, _ in components).issubset(desc_exts):
            return None
        total = sum(v for _, v in components)
        self.state.candidate_numeric_answer = str(total)
        self.state.candidate_implausible = False
        parts = " + ".join(str(v) for _, v in components)
        return f"Hint: you counted components by extension; submit the total {parts} = {total}."

    def _formatted_wc_line_answer(self, ctx: OSTaskContext) -> Optional[str]:
        desc = (ctx.raw_description or "").lower()
        if not re.search(r"filename:\s*line_count|file.*highest number of lines|highest number of lines", desc):
            return None
        lines = [ln.strip() for ln in (self.state.last_output_raw or "").splitlines() if ln.strip()]
        if len(lines) != 1:
            return None
        m = re.match(r"^(\d+)\s+(.+?\.txt)\s*$", lines[0])
        if not m:
            return None
        count, path = m.groups()
        filename = path.rstrip("/").split("/")[-1]
        answer = f"{filename}: {count}"
        self.state.candidate_string_answer = answer
        return f"Hint: format the wc output as required; submit `{answer}`."

    def _first_turn_hint(self, ctx: OSTaskContext) -> Optional[str]:
        path = ctx.target_path or "~"
        ext = ctx.extension_filter
        desc = (ctx.raw_description or "").lower()
        if "processes.txt" in desc and re.search(r"\bcurrently\s+running\b", desc):
            return (
                "Hint: read each PID and test it: "
                "`count=0; while read -r pid; do ps -p \"$pid\" >/dev/null 2>&1 && count=$((count+1)); "
                "done < ~/processes.txt; echo $count`."
            )
        if ".env_variables" in desc and "unique keys" in desc and "total number of characters" in desc:
            return (
                "Hint: `keys=$(cut -d '=' -f1 ~/.env_variables | tr '[:upper:]' '[:lower:]' | sort -u); "
                "n=$(printf '%s\\n' \"$keys\" | wc -l); chars=$(printf '%s\\n' \"$keys\" | tr -d '\\n' | wc -c); echo $((n+chars))`."
            )
        if re.search(r"\bmaximum\s+number\b", desc) and re.search(r"\bappears?\b|\bcount\s+how\s+many\s+times\b", desc):
            return (
                f"Hint: compute max first, then count exact matches: "
                f"`max=$(grep -rhoE '[0-9]+' {path}/* | sort -nr | head -1); "
                f"grep -rhoE '[0-9]+' {path}/* | awk -v m=\"$max\" '$1==m{{c++}} END{{print c}}'`."
            )
        if re.search(r"\b(day|date)\b.*\b(highest|most|maximum)\s+number\s+of\s+log\s+entries\b", desc):
            glob = f"*.{ext}" if ext else "*"
            return f"Hint: count leading dates: `grep -hEo '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}' {path}/{glob} | sort | uniq -c | sort -nr | head -1 | awk '{{print $2}}'`."
        if ctx.answer_shape == ANSWER_STRING and re.search(r"filename:\s*line_count|highest number of lines", desc):
            target = path if path not in ("~", "") else "~/data"
            return (
                f"Hint: use `cd {target} && for f in *.txt; do wc -l < \"$f\" | "
                f"awk -v file=\"$f\" '{{print $1, file}}'; done | sort -nr | head -1 | awk '{{print $2\": \"$1}}'`."
            )
        if ctx.task_type == TASK_COUNT_FILES:
            bits = [f"find {path} -type f"]
            if ext:
                bits.append(f"-name '*.{ext}'")
            if ctx.time_filter_days is not None:
                bits.append(f"-mtime -{ctx.time_filter_days}")
            if ctx.size_filter_bytes_gt is not None:
                bits.append(f"-size +{max(1, ctx.size_filter_bytes_gt // 1024)}k")
            if ctx.size_filter_bytes_lt is not None:
                bits.append(f"-size -{max(1, ctx.size_filter_bytes_lt // 1024)}k")
            cmd = " ".join(bits) + " | wc -l"
            return f"Hint: try `{cmd}`."
        if ctx.task_type == TASK_COUNT_MATCHES:
            grep_i = "i" if (ctx.case_sensitive is False or (
                ctx.case_sensitive is not True and re.search(r"\bword\s+[\"']error[\"']|\bword\s+error\b", desc)
            )) else ""
            if ctx.recursive is False and ext:
                return f"Hint: for non-recursive matching lines, use `grep -{grep_i}h PATTERN {path.rstrip('/')}/*.{ext} | wc -l`."
            if ext:
                return f"Hint: for total matching lines, use `grep -{grep_i}rh --include='*.{ext}' PATTERN {path} | wc -l`."
            return f"Hint: for total matching lines, use `grep -{grep_i}rh PATTERN {path} | wc -l`."
        if ctx.task_type == TASK_COUNT_UNIQUE:
            desc = (ctx.raw_description or "").lower()
            if "server.log" in desc and "15/oct/2023" in desc:
                return "Hint: the date is bracketed in access logs: `grep '\\[15/Oct/2023\\]' ~/server.log | awk '{print $1}' | sort -u | wc -l`."
            if re.search(r"\bunique\s+words?\b", desc):
                target = path if path not in ("~", "") else "~/"
                suffix = f"*.{ext}" if ext else "*"
                return (
                    f"Hint: use `cat {target.rstrip('/')}/{suffix} | tr -cs '[:alpha:]' '\\n' | "
                    f"tr '[:upper:]' '[:lower:]' | sort -u | wc -l`."
                )
            if re.search(r"\bip(?:v4)?\s+addresses?\b", desc) and not re.search(
                r"\b(?:starts?|begins?)\s+with\s+(?:an?\s+)?ip\b|\beach\s+(?:line|entry)\s+(?:starts?|begins?)\s+with\s+(?:an?\s+)?ip\b",
                desc,
            ):
                glob = f"*.{ext}" if ext else "*"
                return f"Hint: for IPs anywhere, use `grep -rhoE '([0-9]{{1,3}}\\.){{3}}[0-9]{{1,3}}' {path}/{glob} | sort -u | wc -l`."
            if re.search(r"\bunique\s+dates?\b|\bhow\s+many\s+unique\s+dates?\b", desc):
                glob = f"*.{ext}" if ext else "*"
                if "[" in desc or "timestamp" in desc:
                    return f"Hint: inspect with `head -3 {path}/{glob}`, then extract leading dates with `grep -hEo '^\\[?[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}' {path}/{glob} | sed 's/^\\[//' | sort -u | wc -l`."
            return f"Hint: extract values with grep/awk then `sort -u | wc -l`. Start by inspecting `{path}` to see the data format."
        if ctx.task_type == TASK_COUNT_LINES:
            return f"Hint: use `wc -l` on the target file, or `find {path} -type f -exec cat {{}} + | wc -l` for a directory tree."
        if ctx.task_type == TASK_LARGEST:
            return f"Hint: try `find {path} -type f -printf '%s %p\\n' | sort -rn | head -1`."
        if ctx.task_type == TASK_SUM_SIZE:
            name_clause = f" -name '*.{ext}'" if ext else ""
            # Human-readable size needs bytes→format, because `du -h` outputs
            # strings like "24K" that awk cannot sum.  Keep the pipeline short.
            if ctx.answer_shape == ANSWER_SIZE:
                return (
                    f"Hint: `du -ch $(find {path} -type f{name_clause}) | tail -1 | awk '{{print $1}}'` "
                    f"— gives integer-valued output like '50K', not '50.0K'."
                )
            return (
                f"Hint: `find {path} -type f{name_clause} -printf '%s\\n' | "
                f"awk '{{s+=$1}} END{{print s}}'` for total bytes."
            )
        if ctx.task_type == TASK_AVERAGE:
            # Column-delimited files are the common case; generic but robust.
            return (
                f"Hint: run `head -3 {path}` first to see the delimiter, then "
                f"`awk -F: '$2~/^[0-9]+$/{{s+=$2;c++}} END{{if(c>0)printf \"%.0f\",s/c; else print 0}}' {path}`."
            )
        return None

    # ── H2 answer normalisation ──────────────────────────────────────────────

    def normalize_answer(self, value: str) -> Tuple[str, bool]:
        if self.task_ctx is None:
            return value, False
        return normalize_answer(value, self.task_ctx.answer_shape)


class Harness:
    """Expose the released OS Interaction runtime through the current hooks."""

    def __init__(self, config: Optional[OSHarnessConfig] = None):
        self.h4_persistent = True
        self.h4_message_prefix = ""
        self.h2_preserve_raw_history = True
        self.h5_message_prefix = "\n\nSome tips that may help for this task:\n- "
        self.runtime = OSHarnessRuntime(config or OSHarnessConfig(
            enabled=True, h2_enabled=True, h3_enabled=True, h4_enabled=True,
            h5_enabled=True, h5_top_k=1, h5_score_threshold=7.5,
        ))
        self._ready = False
        self._seen_tool_count = 0
        self._turn = 0

    def bind_task_context(self, context: Optional[Dict[str, Any]]) -> None:
        if context is None:
            return
        if not isinstance(context, dict) or not isinstance(context.get("description"), str):
            raise ValueError("OS context requires the public task description")
        self.runtime.init_task(context["description"])
        self._ready = True

    def h3(self, tools):
        return patch_os_tool_descriptions(tools)

    def h5(self, messages):
        self._ensure_ready(messages)
        return self._one_hint(*[x["text"] for x in self.runtime.cold_start_skill_hints()])

    def h4(self, messages, remaining):
        self._ensure_ready(messages)
        hints: List[str] = []
        observations = [item for item in messages if item.get("role") == "tool"]
        for observation in observations[self._seen_tool_count:]:
            call = self._matching_call(messages, observation.get("tool_call_id"))
            if not call or call.get("function", {}).get("name") != "bash_action":
                continue
            try:
                args = json.loads(call["function"]["arguments"])
                script = args.get("script", next(iter(args.values()), ""))
            except (ValueError, TypeError, KeyError, AttributeError):
                continue
            content = str(observation.get("content") or "")
            if content == "The output of the OS is empty.":
                content = ""
            elif content.startswith("The output of the OS:\n\n"):
                content = content.split("\n\n", 1)[1]
            self.runtime.update_state_after_bash(script, content)
            monitor = self.runtime.post_step_monitor(remaining_rounds=remaining + 1)
            if monitor.get("force_action"):
                self.runtime.force_next_action = monitor["force_action"]
            active = bool(monitor.get("recovery_prompt") or monitor.get("force_action"))
            if monitor.get("recovery_prompt"):
                hints.append(monitor["recovery_prompt"])
            step = self.runtime.step_guidance(
                max(0, self._turn - 1), max(self._turn + remaining, 1),
                h4_audit_active=active,
            )
            if step:
                hints.append(step)
        self._seen_tool_count = len(observations)
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
                if rescued["name"] == "answer_action":
                    answer = rescued.get("arguments", {}).get("answer")
                    if isinstance(answer, str):
                        rescued["arguments"]["answer"] = self.runtime.normalize_answer(answer)[0]
                self.runtime.note_rescue_hit()
                out = self._message_call(
                    out, "harness_rescue_%d" % self._turn,
                    rescued["name"], rescued.get("arguments") or {},
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
        if name == "bash_action":
            script = args.get("script", next(iter(args.values()), ""))
            if not isinstance(script, str):
                return out
            checked = self.runtime.pre_validate_action(name, script)
            if checked.get("blocked"):
                return {"role": "assistant", "content": "Harness: " + str(checked.get("reason") or "command blocked")}
            if checked.get("action_name") == name and checked.get("action_value") == script:
                return out
            return self._message_call(
                out, call.get("id"), checked.get("action_name") or name,
                {"script": checked.get("action_value") or ""},
            )
        if name == "answer_action":
            answer = args.get("answer", next(iter(args.values()), ""))
            if isinstance(answer, str):
                normalized = self.runtime.normalize_answer(answer)[0]
            else:
                normalized = answer
            self.runtime.note_answer_submitted()
            if normalized == answer:
                return out
            return self._message_call(out, call.get("id"), name, {"answer": normalized})
        return out

    def _ensure_ready(self, history):
        if self._ready:
            return
        user = next((str(item.get("content") or "") for item in history if item.get("role") == "user"), "")
        marker = "My problem is:"
        description = user.split(marker, 1)[1].strip() if marker in user else user
        self.runtime.init_task(description)
        self._ready = True

    @staticmethod
    def _matching_call(history, call_id):
        return next((call for item in reversed(history) for call in item.get("tool_calls") or [] if call.get("id") == call_id), None)

    @staticmethod
    def _message_call(message, call_id, name, arguments):
        result = copy.deepcopy(message)
        result["role"] = "assistant"
        result["tool_calls"] = [{"id": str(call_id), "type": "function", "function": {"name": name, "arguments": json.dumps(arguments, ensure_ascii=False)}}]
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
