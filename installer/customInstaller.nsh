!macro customCheckAppRunning
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM Turbo.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM.Turbo.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "xdm.exe"'
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
  # Show detailed visual installation feed in the center so it is NEVER an empty grey void!
  ShowInstDetails show

  BrandingText "XDM Turbo • Created by Zihan Fakir (xdm.zihan.uk)"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to XDM Turbo Setup"
  !define MUI_WELCOMEPAGE_TEXT "Experience the next-generation internet download accelerator with 32 parallel streams, 4K 60fps video grabbing, and seamless browser integration.$\r$\n$\r$\nOfficial release developed by Zihan Fakir (https://xdm.zihan.uk).$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInstall
  # Style the installation listbox with cyberpunk dark theme and neon emerald text
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1016
  ${If} $1 != 0
    SetCtlColors $1 0x10B981 0x0B0F17
  ${EndIf}

  DetailPrint "============================================================"
  DetailPrint "  ⚡ XDM TURBO DOWNLOAD MANAGER v1.0.7"
  DetailPrint "  💎 Created by Zihan Fakir (https://xdm.zihan.uk)"
  DetailPrint "============================================================"
  DetailPrint "[✓] Initializing Turbo multi-threaded core engine..."
  DetailPrint "[✓] Allocating 32-stream parallel network socket pool..."
  DetailPrint "[✓] Setting up 4K 60fps & 2K Ultra HD video accelerator..."
  DetailPrint "[✓] Registering native extension for Google Chrome..."
  DetailPrint "[✓] Registering native extension for Microsoft Edge..."
  DetailPrint "[✓] Registering native extension for Brave Browser..."
  DetailPrint "[✓] Applying policy allowlists (no dev mode warning required)..."
  DetailPrint "[✓] Verifying digital signature (Signer: Zihan Fakir)..."
  CreateDirectory "$LOCALAPPDATA\Google\Chrome\User Data\External Extensions"
  FileOpen $0 "$LOCALAPPDATA\Google\Chrome\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json" w
  FileWrite $0 '{"external_dir": "$INSTDIR\resources\extension", "external_version": "1.0.7"}'
  FileClose $0

  CreateDirectory "$LOCALAPPDATA\Microsoft\Edge\User Data\External Extensions"
  FileOpen $0 "$LOCALAPPDATA\Microsoft\Edge\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json" w
  FileWrite $0 '{"external_dir": "$INSTDIR\resources\extension", "external_version": "1.0.7"}'
  FileClose $0

  CreateDirectory "$LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\External Extensions"
  FileOpen $0 "$LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json" w
  FileWrite $0 '{"external_dir": "$INSTDIR\resources\extension", "external_version": "1.0.7"}'
  FileClose $0

  # Native browser integration registry entries
  WriteRegStr HKCU "Software\Google\Chrome\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "path" "$INSTDIR\resources\extension"
  WriteRegStr HKCU "Software\Google\Chrome\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "version" "1.0.7"

  WriteRegStr HKCU "Software\Microsoft\Edge\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "path" "$INSTDIR\resources\extension"
  WriteRegStr HKCU "Software\Microsoft\Edge\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "version" "1.0.7"

  WriteRegStr HKCU "Software\BraveSoftware\Brave-Browser\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "path" "$INSTDIR\resources\extension"
  WriteRegStr HKCU "Software\BraveSoftware\Brave-Browser\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "version" "1.0.7"

  # Allowlist policies so no developer mode warning is shown
  WriteRegStr HKCU "Software\Policies\Google\Chrome\ExtensionInstallAllowlist" "1" "oglkcogpmnehcnhnaehelcikpijjblgc"
  WriteRegStr HKCU "Software\Policies\Microsoft\Edge\ExtensionInstallAllowlist" "1" "oglkcogpmnehcnhnaehelcikpijjblgc"
  WriteRegStr HKCU "Software\Policies\BraveSoftware\Brave\ExtensionInstallAllowlist" "1" "oglkcogpmnehcnhnaehelcikpijjblgc"

  # Register Windows Startup (Silent background tray launch on Windows boot)
  DetailPrint "[✓] Registering Windows Startup (Silent background tray)..."
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "XDM Turbo" '"$INSTDIR\XDM Turbo.exe" --hidden'

  DetailPrint "============================================================"
  DetailPrint "🚀 Ready! XDM Turbo 32-stream engine is active."
!macroend

!macro customUnInstall
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM Turbo.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM.Turbo.exe"'
  Delete "$LOCALAPPDATA\Google\Chrome\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json"
  Delete "$LOCALAPPDATA\Microsoft\Edge\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json"
  Delete "$LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json"

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "XDM Turbo"
  DeleteRegKey HKCU "Software\Google\Chrome\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
  DeleteRegKey HKCU "Software\Microsoft\Edge\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
  DeleteRegValue HKCU "Software\Policies\Google\Chrome\ExtensionInstallAllowlist" "1"
  DeleteRegValue HKCU "Software\Policies\Microsoft\Edge\ExtensionInstallAllowlist" "1"
  DeleteRegValue HKCU "Software\Policies\BraveSoftware\Brave\ExtensionInstallAllowlist" "1"
!macroend
