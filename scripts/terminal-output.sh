# shellcheck shell=bash
# Sourced by `install` and `setup`: prints their output as named steps, each step's results indented under its
# heading with a status mark, and questions set apart from the results around them.
#
# Color and the Unicode marks appear only on a terminal when NO_COLOR is unset; otherwise each mark is a bracketed
# word, such as [done], and nothing prints an escape sequence. Long lines wrap only on a terminal whose width is known.
#
#   step <title>                     prints a step's heading
#   done_line, skipped_line, todo_line <text>
#                                    print a result on stdout; warning_line and error_line print one on stderr
#   detail_line <text>               prints text aligned under the results' text; code_line prints it unwrapped
#   ask_question <question> [explanation...]
#                                    sets a question and the lines explaining it apart from the results
#   answer_yes                       reads a [y/N] answer, succeeding on yes
#   choose <choice...>               lists numbered choices and reads one into chosen and chosen_index
#   answer_text <label>              reads a line into answer after the label
#   join_list <item...>              prints the items as "a, b and c"

# Checked once here, since inside a command substitution standard output is a pipe.
terminal_streams=()
[[ -t 1 ]] && terminal_streams[1]=1
[[ -t 2 ]] && terminal_streams[2]=1

terminal_stream() {
  [[ -n ${terminal_streams[$1]:-} ]]
}

styled_stream() {
  terminal_stream "$1" && [[ -z ${NO_COLOR:-} ]]
}

# The width output wraps at: the terminal's, up to 100 columns, or 0 when it isn't known.
output_width=$(stty size 2>/dev/null </dev/tty | awk '{ print ($2 > 100 ? 100 : $2) }') || true
output_width=${output_width:-0}

# Prints text in the SGR style when the stream is styled.
style() {
  local stream=$1 sgr=$2 text=$3
  if [[ -n $sgr ]] && styled_stream "$stream"; then
    printf '\e[%sm%s\e[0m' "$sgr" "$text"
  else
    printf '%s' "$text"
  fi
}

# Prints text after the indent and the lead, which is lead_width columns wide, wrapping lines under the text
# and styling each line with sgr.
print_line() {
  local stream=$1 indent=$2 lead=$3 lead_width=$4 sgr=$5 text=$6 line first=1 text_width
  text_width=$((output_width - indent - lead_width))
  if terminal_stream "$stream" && ((output_width > 0 && text_width >= 30)); then
    text=$(fold -s -w "$text_width" <<<"$text" | sed 's/ *$//')
  fi
  while IFS= read -r line; do
    if ((first)); then
      printf '%*s%s%s\n' "$indent" '' "$lead" "$(style "$stream" "$sgr" "$line")"
      first=0
    else
      printf '%*s%s\n' $((indent + lead_width)) '' "$(style "$stream" "$sgr" "$line")"
    fi
  done <<<"$text" >&"$stream"
}

# Prints the mark for a result kind on the stream, and sets mark_width to its width with the space after it.
status_mark() {
  local stream=$1 kind=$2 glyph sgr word
  case $kind in
    success) glyph="✓" sgr=32 word="done" ;;
    skipped) glyph="–" sgr=2 word=skip ;;
    warning) glyph="!" sgr='1;33' word=warn ;;
    error) glyph="✗" sgr='1;31' word=fail ;;
    todo) glyph="→" sgr=36 word=todo ;;
  esac
  if styled_stream "$stream"; then
    mark=$(style "$stream" "$sgr" "$glyph")
    mark_width=2
  else
    mark="[$word]"
    mark_width=7
  fi
}

status_line() {
  local kind=$1 stream=$2 text=$3 mark mark_width
  status_mark "$stream" "$kind"
  print_line "$stream" 2 "$mark " "$mark_width" "" "$text"
}

done_line() { status_line success 1 "$*"; }
skipped_line() { status_line skipped 1 "$*"; }
todo_line() { status_line todo 1 "$*"; }
warning_line() { status_line warning 2 "$*"; }
error_line() { status_line error 2 "$*"; }

detail_line() {
  local mark mark_width
  status_mark 1 success
  print_line 1 $((2 + mark_width)) "" 0 "" "$*"
}

code_line() {
  local mark mark_width
  status_mark 1 success
  printf '%*s%s\n' $((4 + mark_width)) '' "$*"
}

step() {
  local bullet
  if styled_stream 1; then bullet=$(style 1 '1;36' "●"); else bullet="=="; fi
  printf '\n%s %s\n' "$bullet" "$(style 1 1 "$1")"
}

ask_question() {
  local explanation
  echo
  print_line 1 2 "$(style 1 '1;35' '?') " 2 1 "$1"
  shift
  for explanation in "$@"; do
    print_line 1 4 "" 0 "" "$explanation"
  done
}

# Prints the input prompt for read -p, which writes it to stderr.
input_prompt() {
  local arrow=">"
  styled_stream 2 && arrow=$(style 2 '1;35' "›")
  printf '    %s %s' "$arrow" "$1"
}

# Fails without asking when standard input isn't a terminal.
answer_yes() {
  local reply
  [[ -t 0 ]] || return 1
  read -r -p "$(input_prompt "[y/N] ")" reply || return 1
  [[ $reply == [yY]* ]]
}

choose() {
  local choices=("$@") index reply
  [[ -t 0 ]] || return 1
  for index in "${!choices[@]}"; do
    printf '    %s) %s\n' $((index + 1)) "${choices[index]}"
  done
  while true; do
    read -r -p "$(input_prompt "Choose a number: ")" reply || return 1
    if [[ $reply =~ ^[0-9]{1,9}$ ]] && ((10#$reply >= 1 && 10#$reply <= ${#choices[@]})); then
      chosen_index=$((10#$reply - 1))
      # shellcheck disable=SC2034 # read by the script that sources this file
      chosen=${choices[chosen_index]}
      return 0
    fi
  done
}

answer_text() {
  [[ -t 0 ]] || return 1
  # shellcheck disable=SC2034 # read by the script that sources this file
  read -r -p "$(input_prompt "$1")" answer
}

join_list() {
  case $# in
    0) ;;
    1) printf '%s' "$1" ;;
    *)
      local items=("$@")
      local last=${items[$# - 1]}
      unset 'items[$# - 1]'
      local IFS=,
      printf '%s and %s' "${items[*]/#/ }" "$last" | sed 's/^ //'
      ;;
  esac
}
