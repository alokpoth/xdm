!macro customInit
  nsExec::Exec 'taskkill /F /IM "XDM Turbo.exe" /T'
  nsExec::Exec 'taskkill /F /IM "XDM Turbo 1.0.4.exe" /T'
  nsExec::Exec 'taskkill /F /IM "XDM Turbo 1.0.5.exe" /T'
  nsExec::Exec 'taskkill /F /IM "XDM.Turbo.exe" /T'
  nsExec::Exec 'taskkill /F /IM "xdm.exe" /T'
  Sleep 1000
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
  nsExec::Exec 'taskkill /F /IM "XDM Turbo.exe" /T'
  nsExec::Exec 'taskkill /F /IM "XDM Turbo 1.0.4.exe" /T'
  nsExec::Exec 'taskkill /F /IM "XDM Turbo 1.0.5.exe" /T'
  nsExec::Exec 'taskkill /F /IM "XDM.Turbo.exe" /T'
  DeleteRegKey HKCU "Software\Google\Chrome\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
  DeleteRegKey HKCU "Software\Microsoft\Edge\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
!macroend
