# README recording: a real Pi 1.0.4 session with this checkout's OMPS and four real child Pi processes.
# The model is a local fake (scripts/readme-demo.ts); agents, tasks and paths are synthetic.
# Run from the repository root: vhs scripts/readme-demo.tape

Output docs/assets/omps-demo.gif

Require bun

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 700
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 15ms
Set Framerate 12
Set PlaybackSpeed 1.0

Hide
Type "clear && bun scripts/readme-demo.ts" Enter
Sleep 5s
Show

Type "Run four agents in parallel: review the API, plan the rollout, list the TypeScript files and update the README." Enter
Sleep 5s
Screenshot docs/assets/omps-agent-tree.png
# vhs captures with a short lag, so pause before the next key.
Sleep 1s

Down
Sleep 800ms
Down
Sleep 2s
Screenshot docs/assets/omps-agent-list.png
Sleep 500ms
Escape

Wait+Screen@20s /✓/
Sleep 1500ms
Screenshot docs/assets/omps-agent-finished.png
Sleep 1s

Hide
Ctrl+C
Ctrl+C
Sleep 1s
