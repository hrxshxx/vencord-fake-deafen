# FakeDeafen (Vencord userplugin)

Appear deafened (and optionally muted) to others in a voice channel while still hearing everyone.

## Install on macOS

1. Install the tools (via [Homebrew](https://brew.sh)):
   ```sh
   brew install git node
   npm install -g pnpm
   ```
2. Clone Vencord and add this plugin:
   ```sh
   git clone https://github.com/Vendicated/Vencord ~/Vencord
   cd ~/Vencord && pnpm i
   git clone https://github.com/hrxshxx/vencord-fake-deafen src/userplugins/fakeDeafen
   ```
3. Build and inject:
   ```sh
   pnpm build
   pnpm inject
   ```
   Pick your Discord install (e.g. `/Applications/Discord.app`) when asked.
   - If injection fails with "Operation not permitted", give your terminal app
     **App Management** (and if needed **Full Disk Access**) in
     System Settings → Privacy & Security, then run `pnpm inject` again.
4. Fully quit Discord (⌘Q, not just closing the window) and reopen it.
5. Enable **FakeDeafen** in Settings → Vencord → Plugins.

After a Discord update wipes Vencord, run `pnpm inject` again. To update the plugin:
`cd ~/Vencord/src/userplugins/fakeDeafen && git pull && cd ~/Vencord && pnpm build`.

**Vesktop users:** build with `pnpm build`, then in Vesktop go to Settings → Vesktop →
Vencord Location and point it at `~/Vencord/dist`.

## Usage

- Click the **headphones button with a dot** next to mute / deafen at the bottom left
  (it turns red with a slash while fake deafen is on)
- **⌘ + ⌥ + D** toggles fake deafen (Ctrl + Alt + D on Windows/Linux)
- Toolbox → "Toggle Fake Deafen" (requires the VencordToolbox plugin)
- `/fakedeafen` slash command

> Client mods violate Discord's ToS. Use at your own risk.
