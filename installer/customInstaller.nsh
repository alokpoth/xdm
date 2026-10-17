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
  WriteRegStr HKCU "Software\Google\Chrome\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "path" "$INSTDIR\resources\extension"
  WriteRegStr HKCU "Software\Google\Chrome\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "version" "1.0.5"
  WriteRegStr HKCU "Software\Microsoft\Edge\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "path" "$INSTDIR\resources\extension"
  WriteRegStr HKCU "Software\Microsoft\Edge\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "version" "1.0.5"
  WriteRegStr HKCU "Software\BraveSoftware\Brave-Browser\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "path" "$INSTDIR\resources\extension"
  WriteRegStr HKCU "Software\BraveSoftware\Brave-Browser\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "version" "1.0.5"
!macroend

!macro customUnInstall
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM Turbo.exe"'
  nsExec::Exec '$SYSDIR\cmd.exe /c taskkill /F /IM "XDM.Turbo.exe"'
  DeleteRegKey HKCU "Software\Google\Chrome\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
  DeleteRegKey HKCU "Software\Microsoft\Edge\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
!macroend
