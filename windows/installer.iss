; Umbra Wiki for Windows: the installer (Inno Setup 6). Built by the
; Windows workflow after PyInstaller:
;   iscc /DAppVersion=3.1.1 windows\installer.iss
; Installs for the current user (no administrator needed), offers to install
; Ollama (the local AI engine), and keeps the user's data on updates and
; uninstall (Umbra's own Settings > Uninstall removes that too).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{8C1F5B7E-4E0D-4B8A-9C55-5B0D1A7E2F31}
AppName=Umbra Wiki
AppVersion={#AppVersion}
AppVerName=Umbra Wiki {#AppVersion}
AppPublisher=umbraxc
AppPublisherURL=https://github.com/umbraxc/omarchy-umbra
AppSupportURL=https://github.com/umbraxc/omarchy-umbra/issues
AppUpdatesURL=https://github.com/umbraxc/omarchy-umbra/releases/latest
DefaultDirName={localappdata}\Programs\Umbra Wiki
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir=..\dist
OutputBaseFilename=Umbra-Wiki-Setup-{#AppVersion}
SetupIconFile=umbra.ico
UninstallDisplayIcon={app}\Umbra Wiki.exe
UninstallDisplayName=Umbra Wiki
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
CloseApplications=yes
RestartApplications=no

[Messages]
WelcomeLabel2=This installs Umbra Wiki {#AppVersion}, the offline survival assistant: a local AI that answers from a library stored on your computer, and keeps working with no internet.%n%nNothing is sent anywhere: everything runs on this PC.

[Tasks]
Name: "ollama"; Description: "Install Ollama, the local AI engine Umbra needs (free, downloads about 1 GB)"; Check: not OllamaInstalled
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "..\dist\Umbra Wiki\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[InstallDelete]
; An update replaces the app's files completely (the user's data lives elsewhere).
Type: filesandordirs; Name: "{app}\_internal"

[Icons]
Name: "{autoprograms}\Umbra Wiki"; Filename: "{app}\Umbra Wiki.exe"; AppUserModelID: "umbraxc.UmbraWiki"
Name: "{autodesktop}\Umbra Wiki"; Filename: "{app}\Umbra Wiki.exe"; Tasks: desktopicon; AppUserModelID: "umbraxc.UmbraWiki"

[Run]
Filename: "{tmp}\OllamaSetup.exe"; Parameters: "/SILENT /SUPPRESSMSGBOXES /NORESTART"; StatusMsg: "Installing Ollama, the local AI engine..."; Tasks: ollama; Check: OllamaDownloaded
Filename: "{app}\Umbra Wiki.exe"; Description: "Open Umbra Wiki"; Flags: nowait postinstall skipifsilent
; After an update from inside Umbra (a quiet install): open the new version.
Filename: "{app}\Umbra Wiki.exe"; Flags: nowait; Check: Relaunch

[Code]
var
  DownloadPage: TDownloadWizardPage;

function OllamaInstalled: Boolean;
begin
  Result := FileExists(ExpandConstant('{localappdata}\Programs\Ollama\ollama.exe'));
end;

function OllamaDownloaded: Boolean;
begin
  Result := FileExists(ExpandConstant('{tmp}\OllamaSetup.exe'));
end;

function Relaunch: Boolean;
begin
  Result := WizardSilent and (ExpandConstant('{param:RELAUNCH|0}') = '1');
end;

{ Umbra updates itself by starting this installer and closing: wait for it
  to close (up to 30 s) before replacing its files. }
function WaitForUmbra: Boolean;
var
  I: Integer;
begin
  I := 0;
  while CheckForMutexes('UmbraWikiRunning') and (I < 60) do
  begin
    Sleep(500);
    I := I + 1;
  end;
  Result := True;
end;

function InitializeSetup: Boolean;
begin
  Result := WaitForUmbra;
end;

function InitializeUninstall: Boolean;
begin
  Result := WaitForUmbra;
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), 'Downloading Ollama, the local AI engine...', nil);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = wpReady) and WizardIsTaskSelected('ollama') then
  begin
    DownloadPage.Clear;
    DownloadPage.Add('https://ollama.com/download/OllamaSetup.exe', 'OllamaSetup.exe', '');
    DownloadPage.Show;
    try
      try
        DownloadPage.Download;
      except
        if not DownloadPage.AbortedByUser then
          SuppressibleMsgBox('Ollama could not be downloaded (' + GetExceptionMessage + ').' + #13#10#13#10 +
            'Umbra Wiki is installed anyway; get Ollama later from ollama.com/download. Umbra''s welcome tour reminds you.',
            mbInformation, MB_OK, IDOK);
      end;
    finally
      DownloadPage.Hide;
    end;
  end;
end;
