# -----------------------------------------------------------------------------
# XDM Turbo v1.0.9 — Premium Dark Obsidian Modern UI Theme
# Developed by Zihan Fakir (https://xdm.zihan.uk)
# Obsidian: #070B13, Surface: #161920, Emerald: #10B981, Pure White: #FFFFFF
# -----------------------------------------------------------------------------

!include "LogicLib.nsh"

# Theme Colors for NSIS Modern UI 2
!define MUI_BGCOLOR "070B13"
!define MUI_TEXTCOLOR "F1F5F9"
!define MUI_INSTFILESPAGE_COLORS "10B981 070B13"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
!define MUI_FINISHPAGE_LINK_COLOR "10B981"
!define MUI_DIRECTORYPAGE_BGCOLOR "161920"
!define MUI_DIRECTORYPAGE_TEXTCOLOR "F1F5F9"

!ifndef BUILD_UNINSTALLER

# Hook into MUI GUI initialization to style outer window and header
!define MUI_CUSTOMFUNCTION_GUIINIT customMuiGuiInit

Function customMuiGuiInit
  # Set dark background on outer dialog ($HWNDPARENT)
  SetCtlColors $HWNDPARENT 0xF1F5F9 0x070B13

  # Hide outdated etched divider lines (Win95 3D bevels)
  GetDlgItem $0 $HWNDPARENT 1035
  ${If} $0 != 0
    ShowWindow $0 0
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1045
  ${If} $0 != 0
    ShowWindow $0 0
  ${EndIf}

  # Header controls (Control 1034 = Background, 1037 = Title, 1038 = Subtitle)
  GetDlgItem $0 $HWNDPARENT 1034
  ${If} $0 != 0
    SetCtlColors $0 0xFFFFFF 0x070B13
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1037
  ${If} $0 != 0
    SetCtlColors $0 0xFFFFFF 0x070B13
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1038
  ${If} $0 != 0
    SetCtlColors $0 0x10B981 0x070B13
  ${EndIf}

  # Branding text controls (1028 = Background, 1256 = Text)
  GetDlgItem $0 $HWNDPARENT 1028
  ${If} $0 != 0
    SetCtlColors $0 0x10B981 0x070B13
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1256
  ${If} $0 != 0
    SetCtlColors $0 0x10B981 0x070B13
  ${EndIf}
FunctionEnd

Function customWelcomeShow
  FindWindow $0 "#32770" "" $HWNDPARENT
  ${If} $0 != 0
    SetCtlColors $0 0xF1F5F9 0x070B13
    GetDlgItem $1 $0 1201
    ${If} $1 != 0
      SetCtlColors $1 0xFFFFFF 0x070B13
    ${EndIf}
    GetDlgItem $1 $0 1202
    ${If} $1 != 0
      SetCtlColors $1 0xCBD5E1 0x070B13
    ${EndIf}
  ${EndIf}
FunctionEnd

Function customInstFilesShow
  FindWindow $0 "#32770" "" $HWNDPARENT
  ${If} $0 != 0
    SetCtlColors $0 0xF1F5F9 0x070B13
    GetDlgItem $1 $0 1006
    ${If} $1 != 0
      SetCtlColors $1 0x10B981 0x070B13
    ${EndIf}
  ${EndIf}
FunctionEnd

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to XDM Turbo"
  !define MUI_WELCOMEPAGE_TEXT "Get ready for the fastest, most powerful download experience on Windows.$\r$\n$\r$\n✦ Turbo Multi-Stream Speed Acceleration (64 Parallel Streams)$\r$\n✦ 4K & High-Definition Video Downloader$\r$\n✦ 1-Click Browser Integration for Chrome, Edge & Brave$\r$\n✦ 100% Secure, Clean & Ad-Free$\r$\n$\r$\nClick Next to start the quick installation."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW customWelcomeShow
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW customInstFilesShow
!macroend

!endif

# Enforce per-user installation without showing the ugly white multiuser mode dialog
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customCheckAppRunning
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM Turbo.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM.Turbo.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "xdm.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "ffmpeg.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "yt-dlp.exe"'
  Sleep 500
!macroend

!macro customUnInstallCheck
  ClearErrors
  StrCpy $R0 0
!macroend

!macro customUnInstallCheckCurrentUser
  ClearErrors
  StrCpy $R0 0
!macroend

!macro customHeader
  ShowInstDetails nevershow
  BrandingText "XDM Turbo Download Manager"
!macroend

!macro customInstall
  SetDetailsPrint none

  # Create Start Menu and Desktop shortcuts cleanly without WinShell.dll dependency
  CreateDirectory "$SMPROGRAMS\XDM Turbo"
  CreateShortCut "$SMPROGRAMS\XDM Turbo\XDM Turbo.lnk" "$INSTDIR\XDM Turbo.exe" "" "$INSTDIR\XDM Turbo.exe" 0 "" "" "XDM Turbo Download Manager"
  CreateShortCut "$SMPROGRAMS\XDM Turbo.lnk" "$INSTDIR\XDM Turbo.exe" "" "$INSTDIR\XDM Turbo.exe" 0 "" "" "XDM Turbo Download Manager"
  CreateShortCut "$DESKTOP\XDM Turbo.lnk" "$INSTDIR\XDM Turbo.exe" "" "$INSTDIR\XDM Turbo.exe" 0 "" "" "XDM Turbo Download Manager"

  # Native browser integration configuration (Clean external extensions JSON, 100% safe & trusted)
  CreateDirectory "$LOCALAPPDATA\Google\Chrome\User Data\External Extensions"
  FileOpen $0 "$LOCALAPPDATA\Google\Chrome\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json" w
  FileWrite $0 '{"external_dir": "$INSTDIR\resources\extension", "external_version": "1.0.9"}'
  FileClose $0

  CreateDirectory "$LOCALAPPDATA\Microsoft\Edge\User Data\External Extensions"
  FileOpen $0 "$LOCALAPPDATA\Microsoft\Edge\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json" w
  FileWrite $0 '{"external_dir": "$INSTDIR\resources\extension", "external_version": "1.0.9"}'
  FileClose $0

  CreateDirectory "$LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\External Extensions"
  FileOpen $0 "$LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json" w
  FileWrite $0 '{"external_dir": "$INSTDIR\resources\extension", "external_version": "1.0.9"}'
  FileClose $0

  # Register Windows Startup (Silent background tray launch on Windows boot)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "XDM Turbo" '"$INSTDIR\XDM Turbo.exe" --hidden'
!macroend

!macro customUnInstall
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM Turbo.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM.Turbo.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "xdm.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "ffmpeg.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "yt-dlp.exe"'

  Delete "$SMPROGRAMS\XDM Turbo\XDM Turbo.lnk"
  RMDir "$SMPROGRAMS\XDM Turbo"
  Delete "$SMPROGRAMS\XDM Turbo.lnk"
  Delete "$DESKTOP\XDM Turbo.lnk"

  Delete "$LOCALAPPDATA\Google\Chrome\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json"
  Delete "$LOCALAPPDATA\Microsoft\Edge\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json"
  Delete "$LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json"

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "XDM Turbo"
!macroend
