AI CLI Orchestrator - Installation Guide
=========================================

Thank you for installing AI CLI Orchestrator!

WHAT IS AI CLI ORCHESTRATOR?
-----------------------------
AI CLI Orchestrator is a powerful tool that helps you manage multiple AI coding 
assistants (like Claude, Gemini, Copilot, etc.) with automatic failover, context 
sharing, and parallel execution.

SYSTEM REQUIREMENTS
-------------------
- Windows 10 or later (64-bit)
- 500 MB free disk space
- 2 GB RAM minimum
- Internet connection (for AI CLI downloads)
- Node.js 18+ and npm (required for AI CLI tools)

IMPORTANT: NODE.JS REQUIREMENT
------------------------------
AI CLI tools require Node.js to be installed. If you don't have Node.js:

1. Download from: https://nodejs.org/
2. Install Node.js (LTS version recommended)
3. Restart this installer

The orchestrator will automatically download and configure AI CLI tools on first run.

WHAT GETS INSTALLED
-------------------
- AI CLI Orchestrator application
- Workspace templates in your Documents folder
- Configuration files in your AppData folder

FIRST RUN
---------
1. Launch AI CLI Orchestrator from Start Menu or Desktop
2. Your browser will open automatically
3. The dashboard will show "Initializing Environment"
4. AI CLI tools will be downloaded automatically (2-3 minutes)
5. Once complete, you're ready to start orchestrating!

WORKSPACE LOCATION
------------------
Your workspace files are located at:
  Documents\AI-Orchestrator-Workspace\

This includes:
  - workspace.yaml (configuration)
  - skill.md (project capabilities)
  - plan.md (project plan)
  - sessions\ (session history)

GETTING STARTED
---------------
1. Open the workspace files in your favorite editor
2. Update skill.md with your project's tech stack
3. Update plan.md with your project goals
4. Start using AI CLIs through the dashboard!

TROUBLESHOOTING
---------------
If the application doesn't start:
  - Check if Node.js is installed: node --version
  - Check if port 8000 is available
  - Check logs in: %LOCALAPPDATA%\.orchestrator\logs\

If AI CLIs don't install:
  - Ensure Node.js and npm are installed
  - Check your internet connection
  - Try manual installation (see documentation)

DOCUMENTATION
-------------
Full documentation: https://github.com/yourusername/ai-cli-orchestrator
Issues & Support: https://github.com/yourusername/ai-cli-orchestrator/issues

UNINSTALLING
------------
Use Windows "Add or Remove Programs" to uninstall.
You'll be asked if you want to keep your workspace data.

LICENSE
-------
See LICENSE file for license information.

SUPPORT
-------
For help and support:
- Documentation: See README.md in installation folder
- GitHub Issues: Report bugs and request features
- Community: Join our Discord/Slack community

Thank you for using AI CLI Orchestrator!