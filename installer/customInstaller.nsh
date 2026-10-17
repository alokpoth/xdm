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

!macro customInstall
  ${ifNot} ${FileExists} "$INSTDIR\XDM Turbo.exe"
    DetailPrint "Directly extracting application package to $INSTDIR..."
    SetOutPath "$INSTDIR"
    Nsis7z::Extract "$PLUGINSDIR\app-64.7z"
  ${endif}

  # Write clean external extension json if browser profile exists
  CreateDirectory "$LOCALAPPDATA\Google\Chrome\User Data\External Extensions"
  FileOpen $0 "$LOCALAPPDATA\Google\Chrome\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json" w
  FileWrite $0 '{"external_dir": "$INSTDIR\resources\extension", "external_version": "1.0.5"}'
  FileClose $0

  CreateDirectory "$LOCALAPPDATA\Microsoft\Edge\User Data\External Extensions"
  FileOpen $0 "$LOCALAPPDATA\Microsoft\Edge\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json" w
  FileWrite $0 '{"external_dir": "$INSTDIR\resources\extension", "external_version": "1.0.5"}'
  FileClose $0

  CreateDirectory "$LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\External Extensions"
  FileOpen $0 "$LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json" w
  FileWrite $0 '{"external_dir": "$INSTDIR\resources\extension", "external_version": "1.0.5"}'
  FileClose $0
!macroend

!macro customUnInstall
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM Turbo.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM.Turbo.exe"'
  Delete "$LOCALAPPDATA\Google\Chrome\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json"
  Delete "$LOCALAPPDATA\Microsoft\Edge\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json"
  Delete "$LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\External Extensions\oglkcogpmnehcnhnaehelcikpijjblgc.json"
!macroend
