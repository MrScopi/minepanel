# Manual Mod Manager

## Goal
Add an interface to the Server Configuration menu that opens a panel for manual mod tracking.  The goal would be to help server owners check which of their mods on their server are ready to be updated, especially considering when new releases drop quarterly for the main game.  Primarily targeting "Vanilla-adjacent" servers that try to keep up with Bedrock for crossplay.

## Implementation Idea
- Provide an interface to browse for mods from Modrinth/CurseForge, or paste in links to their About page
- Check via API for:
    - Versions matching the server version
    - Latest MC version supported
    - Changelog diff since last update
- Player can select a "desired" MC version (e.g. upcoming releases)
- Interface shows each mod as a collapsible row
    - One-line summary shows current version, Date Updated, and Date Added to Server
    - Can expand to get mod summary, any listed dependencies, or similar
    - Optionally, allow Admins to keep notes on particular mods (e.g. "This is optional and should not block an update")
- Allow one-click downloads to a central location
    - Consider pairing with minecraft-server-docker's built in "mod folder copy" feature to allow downloading and prepping updates while the server is running, and then copy them over at next boot

## Reason for Existing
- Not all server owners use exclusively modpacks
- Provides more control than the API-fetched downloads from minecraft-server-docker
- It is a feature I would use :D