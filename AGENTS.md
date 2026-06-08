# Extension Testing

## Test with -p (non-interactive)

From the repo root:

```bash
pi --no-extensions -e ./extensions/pi-launcher/src/index.ts -p "Use the launch tool"
```

## Test without -p (interactive via tmux)

From the repo root, start pi in a detached tmux session:

```bash
tmux new-session -d -s pi-ext-test "cd $(pwd) && timeout 12s pi --no-extensions -e ./extensions/pi-launcher/src/index.ts"
```

Send input and capture:

```bash
sleep 2
tmux send-keys -t pi-ext-test "/launcher" C-m
sleep 2
tmux capture-pane -pt pi-ext-test
```

Clean up:

```bash
tmux kill-session -t pi-ext-test
```
