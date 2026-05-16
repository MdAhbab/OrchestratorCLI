; AI CLI Orchestrator - Inno Setup Script
; Creates a professional Windows installer

#define MyAppName "AI CLI Orchestrator"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "AI Orchestrator Team"
#define MyAppURL "https://github.com/yourusername/ai-cli-orchestrator"
#define MyAppExeName "orchestrator-backend.exe"
#define MyAppDescription "Orchestrate multiple AI coding assistants with automatic failover"

[Setup]
; NOTE: Generate a new GUID using Tools > Generate GUID in Inno Setup
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
InfoBeforeFile=README.txt
OutputDir=..\dist\windows
OutputBaseFilename=orchestrator-setup
SetupIconFile=icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode
Name: "startmenu"; Description: "Add to Start Menu"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
; Main executable
Source: "..\backend\dist\orchestrator-backend.exe"; DestDir: "{app}"; Flags: ignoreversion

; Workspace templates
Source: "..\workspace\*.template"; DestDir: "{userdocs}\AI-Orchestrator-Workspace"; Flags: ignoreversion

; Documentation
Source: "README.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\{#MyAppExeName}"
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: quicklaunchicon
Name: "{userstartmenu}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startmenu

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{userdocs}\AI-Orchestrator-Workspace"
Type: filesandordirs; Name: "{localappdata}\.orchestrator"

[Code]
var
  NodeJsPage: TInputOptionWizardPage;
  NodeJsInstalled: Boolean;

function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
  DiskSpace: Int64;
begin
  Result := True;
  
  // Check disk space (minimum 500MB)
  if not GetSpaceOnDisk(ExpandConstant('{app}'), False, DiskSpace, DiskSpace) then
  begin
    MsgBox('Unable to check disk space.', mbError, MB_OK);
    Result := False;
    Exit;
  end;
  
  if DiskSpace < 500 * 1024 * 1024 then
  begin
    MsgBox('Insufficient disk space. At least 500MB required.' + #13#10 + 
           'Available: ' + IntToStr(DiskSpace div (1024 * 1024)) + ' MB', 
           mbError, MB_OK);
    Result := False;
    Exit;
  end;
  
  // Check if port 8000 is available (basic check)
  // Note: This is a simplified check. The app will find an alternative port if needed.
end;

function CheckNodeJs(): Boolean;
var
  ResultCode: Integer;
begin
  // Check if Node.js is installed
  Result := Exec('cmd.exe', '/c node --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := Result and (ResultCode = 0);
end;

procedure InitializeWizard();
begin
  // Check Node.js installation
  NodeJsInstalled := CheckNodeJs();
  
  if not NodeJsInstalled then
  begin
    // Create a page to inform about Node.js requirement
    NodeJsPage := CreateInputOptionPage(wpWelcome,
      'Node.js Required', 
      'AI CLI tools require Node.js to be installed',
      'The AI CLI Orchestrator requires Node.js 18+ and npm to download and manage AI CLI tools.' + #13#10 + #13#10 +
      'Node.js was not detected on your system. You can:' + #13#10 +
      '  • Install Node.js now from https://nodejs.org/' + #13#10 +
      '  • Continue installation and install Node.js later' + #13#10 + #13#10 +
      'Note: AI CLI tools will not work until Node.js is installed.',
      False, False);
    
    NodeJsPage.Add('I will install Node.js now (recommended)');
    NodeJsPage.Add('Continue without Node.js (I will install it later)');
    NodeJsPage.SelectedValueIndex := 0;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  ErrorCode: Integer;
begin
  Result := True;
  
  if (CurPageID = NodeJsPage.ID) and (not NodeJsInstalled) then
  begin
    if NodeJsPage.SelectedValueIndex = 0 then
    begin
      // Open Node.js download page
      ShellExec('open', 'https://nodejs.org/en/download/', '', '', SW_SHOW, ewNoWait, ErrorCode);
      MsgBox('Please download and install Node.js, then run this installer again.', mbInformation, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  WorkspaceDir: String;
  ConfigDir: String;
begin
  if CurStep = ssPostInstall then
  begin
    // Create workspace directory
    WorkspaceDir := ExpandConstant('{userdocs}\AI-Orchestrator-Workspace');
    ForceDirectories(WorkspaceDir);
    ForceDirectories(WorkspaceDir + '\sessions');
    ForceDirectories(WorkspaceDir + '\logs');
    
    // Create config directory
    ConfigDir := ExpandConstant('{localappdata}\.orchestrator');
    ForceDirectories(ConfigDir);
    ForceDirectories(ConfigDir + '\logs');
    
    // Copy templates to workspace
    FileCopy(ExpandConstant('{userdocs}\AI-Orchestrator-Workspace\workspace.yaml.template'),
             ExpandConstant('{userdocs}\AI-Orchestrator-Workspace\workspace.yaml'), False);
    FileCopy(ExpandConstant('{userdocs}\AI-Orchestrator-Workspace\skill.md.template'),
             ExpandConstant('{userdocs}\AI-Orchestrator-Workspace\skill.md'), False);
    FileCopy(ExpandConstant('{userdocs}\AI-Orchestrator-Workspace\plan.md.template'),
             ExpandConstant('{userdocs}\AI-Orchestrator-Workspace\plan.md'), False);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Response: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    // Ask if user wants to keep workspace data
    Response := MsgBox('Do you want to keep your workspace data and configuration?' + #13#10 + #13#10 +
                       'This includes your project files, session history, and settings.',
                       mbConfirmation, MB_YESNO);
    
    if Response = IDNO then
    begin
      // User chose to delete everything
      DelTree(ExpandConstant('{userdocs}\AI-Orchestrator-Workspace'), True, True, True);
      DelTree(ExpandConstant('{localappdata}\.orchestrator'), True, True, True);
    end;
  end;
end;

[Messages]
WelcomeLabel2=This will install [name/ver] on your computer.%n%nAI CLI Orchestrator helps you manage multiple AI coding assistants with automatic failover, context sharing, and parallel execution.%n%nIt is recommended that you close all other applications before continuing.