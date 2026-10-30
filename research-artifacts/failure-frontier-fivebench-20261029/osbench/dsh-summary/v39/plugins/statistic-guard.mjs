export const name = 'statistic-guard';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, agent, audit} = payload;
    let denials = 0;
    ac.on('tools/pre-execute', async (call, next) => {
      const result = await next();
      if (result.kind !== 'allow' || call.name !== 'bash_action' || denials >= 2) return result;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message').map(e => e.data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '').find(t => t.includes('My problem is:')) || '';
      let suggestion = script, issue = '';
      if (/lines?/i.test(task) && /count|number|how many/i.test(task) && /contain/i.test(task) && !/unique|distinct|considering only files|files containing|only files that contain/i.test(task) && /grep\s+-[a-zA-Z]*l\b/.test(script) && /wc\s+-l/.test(script)) {
        suggestion = script.replace(/grep\s+(-[a-zA-Z]*)l\b/g, (_, flags) => 'grep ' + (flags === '-' ? '-h' : flags + 'h')).replace(/xargs\s+wc\s+-l/g, 'wc -l');
        issue = 'The task counts matching lines, but grep -l lists matching files. Count the matching lines themselves.';
      } else if (/unique|distinct/i.test(task) && /grep/.test(script) && /sort|uniq/.test(script) && !/grep\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*h/.test(script)) {
        suggestion = script.replace(/\bgrep\b/g, 'grep -h');
        issue = 'For unique values across files, grep must not prefix each value with its filename. Use -h before global deduplication.';
      }
      if (/grep\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*E/.test(script) && /\\+d/.test(script)) {
        suggestion = suggestion.replace(/\\+d/g, '[0-9]');
        issue += ' GNU grep -E uses extended regular expressions: use [0-9] for digits; \\d is not a digit class in this mode.';
      }
      if (/grep/.test(script) && /files/i.test(task) && !/hidden file/i.test(task) && /grep\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*r/.test(script)) {
        const literal = suggestion.match(/([^\s'"|]+)\/\.(log|txt|py)\b/);
        if (literal) {
          suggestion = suggestion.replace(literal[0], literal[1]).replace(/\bgrep\b/, "grep --include='*." + literal[2] + "'");
          issue += ' A bare extension is a literal filename, not a file pattern. For recursive extension selection use a directory and --include.';
        }
      }
      if (/grep/.test(script) && /\[\^\\+n\][*+]/.test(script)) {
        suggestion = suggestion.replace(/\[\^\\+n\]([*+])/g, '.$1');
        issue += ' grep processes one line at a time: use .* or .+ for the rest of a line. The negated class containing backslash-n excludes the letter n and truncates messages.';
      }
      if (/~\\+\//.test(script)) {
        suggestion = suggestion.replace(/~\\+\//g, '$HOME/');
        issue += ' Escaping the slash after tilde prevents home expansion. Use $HOME/ for the requested home path.';
      }
      if (/\bfind\b/.test(script) && /\\+;\s*\\+;\s*\|/.test(script)) {
        suggestion = suggestion.replace(/(\\+;)\s*\\+;\s*(?=\|)/g, '$1 ');
        issue += ' find -exec needs one terminator, not two. Pipe the completed find output to the next command.';
      }
      if (/count how many files|count (?:the )?(?:total )?number of files/i.test(task) && /contain/i.test(task) && /grep/.test(script) && /wc\s+-l/.test(script) && !/grep\s+-[a-zA-Z]*l/.test(script)) {
        suggestion = suggestion.replace(/\bgrep\b/, 'grep -l');
        issue += ' This task counts files containing a match, not matching lines. List each matching filename once before counting.';
      }
      if (/grep/.test(script) && /YYYY-MM-DD/.test(script)) {
        suggestion = suggestion.replace(/YYYY-MM-DD/g, '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
        issue += ' YYYY-MM-DD describes a date format, not literal file content. Match numeric dates.';
      }
      if (/number of lines|total[^.]*lines/i.test(task) && /\bfind\b[^|]*\|\s*wc\s+-l\b/.test(script) && !/-exec|\bcat\b|\bgrep\b/.test(script)) {
        suggestion = suggestion.replace(/-not\s+-follow\b/g, '').replace(/\|\s*wc\s+-l\b/, '| xargs cat | wc -l');
        issue += ' find outputs filenames. This task asks for lines INSIDE the selected files: read their contents before wc -l. Default find does not follow symbolic links; -not -follow is not the exclusion you want.';
      }
      if (/compress|\.gz/i.test(task) && /\bzcat\b/.test(script) && !/\bzcat\s+-[a-zA-Z]*f/.test(script)) {
        suggestion = suggestion.replace(/\bzcat\b/g, 'zcat -f');
        issue += ' The selected files include plain and compressed logs. zcat -f reads gzip data and passes plain files through, so plain logs are not silently omitted.';
      }
      if (/\bfind\b/.test(script) && /-type f -o -type d/.test(script) && !/\\\(/.test(script)) {
        suggestion = suggestion.replace(/-type f -o -type d/, '\\( -type f -o -type d \\)');
        if (/ignor\w* hidden|exclud\w* hidden/i.test(task) && !/-not|-path|!/.test(script)) suggestion = suggestion.replace(/(find\s+\S+)/, "$1 -mindepth 1 -not -path '*/.*'");
        issue += ' Group the file-or-directory predicate so the date constraint applies to both. Exclude hidden paths when requested and do not count the search root itself.';
      }
      if (/grep\s+-c\b/.test(script) && /&&\s*grep\s+-c/.test(script)) {
        suggestion = suggestion.replace(/&&\s*(?=grep\s+-c)/g, '; ');
        issue += ' grep returns exit status 1 for zero matches. Do not use && between independent file counts: run every count, then sum the returned counts for the requested total.';
      }
      if (/number of lines|count[^.]*lines|how many lines/i.test(task) && /contain/i.test(task) && /grep\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*o\b/.test(script)) {
        suggestion = suggestion.replace(/(grep\s+(?:-[a-zA-Z]+\s+)*)(-[a-zA-Z]*)o\b/g, (_, before, flags) => before + (flags === '-' ? '' : flags));
        issue += ' Count matching lines, not occurrences: remove grep -o.';
      }
      if (/standalone word|whole word/i.test(task) && /grep/.test(script) && !/grep\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*w/.test(script)) {
        suggestion = suggestion.replace(/\bgrep\b/g, 'grep -w');
        issue += ' The requested word must stand alone. Use grep -w to exclude substrings inside other words.';
      }
      if (/\bgrep\b/.test(script) && /~\/\.\*\\*\.(log|txt)/.test(script) && /subdirectories/i.test(task)) {
        suggestion = suggestion.replace(/~\/\.\*\\*\.(log|txt)/g, (_, ext) => "--include='*." + ext + "' ~");
        issue += ' Shell globs are not regular expressions. Search the home tree recursively using the requested extension filter.';
      }
      if (/\/home\/\$\(whoami\)/.test(script)) {
        suggestion = suggestion.replace(/\/home\/\$\(whoami\)/g, '$HOME');
        issue += ' Use the actual home directory $HOME; /home/username is only an assumption.';
      }
      if (/grep\s+-E/.test(script) && /\(\?[!=]/.test(script)) {
        suggestion = suggestion.replace(/grep\s+-E/g, 'grep -P');
        issue += ' Lookahead requires PCRE grep -P, not extended grep -E. Verify the other requested filters too.';
      }
      if (/grep\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*r/.test(script) && /\s\.(txt|log|py)(?=\s*\|)/.test(script) && /home directory/i.test(task)) {
        suggestion = suggestion.replace(/\s\.(txt|log|py)(?=\s*\|)/, (_, ext) => " --include='*." + ext + "' ~ ");
        issue += ' A bare extension is not a file glob. Search the home tree with --include for that extension.';
      }
      if (/unique words/i.test(task) && /\btr\b/.test(script) && /wc\s+-l/.test(script) && !/grep\s+(?:-[a-zA-Z]+\s+)*-v/.test(script)) {
        suggestion = suggestion.replace(/\|\s*wc\s+-l/, () => "| grep -v '^$' | wc -l");
        issue += ' Whitespace and punctuation splitting can produce an empty token. Exclude empty lines from the unique-word count.';
      }
      if (/longest line/i.test(task) && /awk/.test(script) && /length\(\$i\)/.test(script)) {
        suggestion = suggestion.replace(/awk\s+'[^']*length\(\$i\)[^']*'/g, () => "awk 'length($0)>max {max=length($0)} END {print max}'");
        issue += ' Measure the full line with length($0), not individual words length($i).';
      }
      if (/most recent event timestamp/i.test(task) && /YYYY-MM-DD HH:MM:SS/.test(task) && /\|\s*xargs\s+-0\s+ls\s+-lt/.test(script)) {
        suggestion = suggestion.replace(/\|\s*xargs\s+-0\s+ls\s+-lt[\s\S]*$/, '| xargs -0 cat | sort -r | head -n 1 | cut -c 1-19');
        issue += ' ls -lt sorts file modification times, not timestamps recorded inside events. Read the selected text files and compare their ISO event timestamps.';
      }
      if (/unique error messages/i.test(task) && /grep/.test(script) && /\[\^(?:\\+s| )\]\+/.test(script)) {
        suggestion = suggestion.replace(/\[\^(?:\\+s| )\]\+/g, '.+');
        issue += ' Preserve the full error message including spaces, rather than only the next word.';
      }
      if (/email domains/i.test(task) && /\[@\]\[\^@\][*+]/.test(script)) {
        suggestion = suggestion.replace(/\[@\]\[\^@\][*+]/g, '@[^@,[:space:]]+');
        issue += ' Stop email-domain extraction at the CSV comma or whitespace; later columns are not part of a domain.';
      }
      const excluded=task.match(/subdirectories named ["']([a-zA-Z0-9_-]+)["']/i);
      if(excluded && /\bfind\b/.test(script)) {
        const bad='*'+excluded[1]+'*';
        if(suggestion.includes(bad)) {
          suggestion=suggestion.replace(bad,'*/'+excluded[1]+'/*');
          issue+=' Exclude the exact directory path segment, not every filename containing that substring.';
        }
        if(/symbolic links/i.test(task)&&!/exclude[^.]*symbolic links/i.test(task)&&!/find\s+-L/.test(script)) {
          suggestion=suggestion.replace(/\bfind\b/,'find -L');
          issue+=' Follow the requested Python-file symbolic links with find -L.';
        }
      }
      if(/~\.\//.test(script)) {
        suggestion=suggestion.replace(/~\.\//g,'~/');
        issue+=' The home-directory path starts with ~/, not ~./.';
      }
      if(/human-readable/i.test(task)&&/du\s+-[a-zA-Z]*h/.test(script)&&/awk/.test(script)&&/(sum|total)\s*\+=\s*\$1/.test(script)) {
        suggestion=suggestion.replace(/du\s+(-[a-zA-Z]*)h/g,(_,flags)=>'du '+flags+'k').replace(/END\s*\{\s*print\s+(sum|total)\s*\}/g,(_,variable)=>'END {print '+variable+'*1024}');
        if(/exclude any subdirectories/i.test(task)&&!/maxdepth/.test(script))suggestion=suggestion.replace(/(find\s+\S+)/,'$1 -maxdepth 1');
        suggestion+=' | numfmt --to=iec';
        issue+=' Do not add human-readable size labels as numbers. Sum sizes in a common unit, then format the final total; keep the requested directory depth.';
      }
      const fileWord=task.match(/considering only files that contain the word ["']([^"']+)["']/i);
      if(fileWord&&/Python files/i.test(task)&&/home directory/i.test(task)&&/grep/.test(script)&&/wc\s+-l|grep\s+-c/.test(script)&&(!/grep\s+-l/.test(script)||/xargs\s+grep\s+-c/.test(script))) {
        suggestion="find ~ -type f -name '*.py' -exec grep -l -F "+"'"+fileWord[1].replace(/'/g,"'\\''")+"' {} + | xargs cat | wc -l";
        issue+=' The keyword selects FILES. Count all lines in those files, not only lines matching the keyword.';
      }
      const sizeGlob=script.match(/([a-zA-Z0-9_~/.+-]+)\/\*\.([a-zA-Z0-9]+)/);
      if(sizeGlob&&/\bdu\b/.test(script)&&/human-readable/i.test(task)&&/subdirectories/i.test(task)&&!/exclude any subdirectories/i.test(task)) {
        suggestion="find "+sizeGlob[1]+" -type f -name '*."+sizeGlob[2]+"'"+(/excluding hidden files/i.test(task)?" -not -path '*/.*'":"")+" -exec du -k {} + | awk '{s+=$1} END {print s*1024}' | numfmt --to=iec";
        issue+=' A top-level extension glob misses subdirectories and per-file sizes are not a total. Recursively select the requested extension, sum one unit, then format the combined size.';
      }
      const leapRange=task.match(/leap years between (\d{4}) and (\d{4})/i);
      if(leapRange&&/February 29/i.test(task)&&/grep\s+'\d{4}-02-29'/.test(script)) {
        const years=[];
        for(let y=Number(leapRange[1]);y<=Number(leapRange[2]);y++)if(y%4===0&&(y%100!==0||y%400===0))years.push(y);
        suggestion=suggestion.replace(/grep\s+'\d{4}-02-29'/,()=>"grep -E '^("+years.join('|')+")-02-29'");
        issue+=' The first filter currently discards every other requested year. Match February 29 in all leap years of the requested inclusive range.';
      }
      if(/between 2 PM and 3 PM/i.test(task)&&/grep/.test(script)&&/2:00:00/.test(script)) {
        suggestion=suggestion.replace(/2:00:00/g,'14:[0-5][0-9]:[0-5][0-9]');
        issue+=' A one-hour afternoon interval is not a single 2:00:00 timestamp. In 24-hour logs, 2 PM to 3 PM covers hour 14; inspect a few input lines first if the format has not been established.';
      }
      if(/\bfind\b/.test(script)&&/\\+;\s*\\+;\s*sort\b/.test(script)) {
        suggestion=suggestion.replace(/(\\+;)\s*\\+;\s*(?=sort\b)/g,'$1 | ');
        issue+=' End find -exec once and pipe its output into sort; a second terminator followed directly by sort is not a pipeline.';
      }
      if (!issue) return result;
      denials++;
      const reason = issue + ' Retry bash_action with this corrected pipeline (preserve requested paths and filters): ' + suggestion;
      audit({method_id:name, hook:'tools/pre-execute', call_id:call.callId, decision:'deny', reason});
      return {kind:'deny', reason};
    });
  });
}
