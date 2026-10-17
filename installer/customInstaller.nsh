!macro customInstall
  WriteRegStr HKCU "Software\Google\Chrome\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "path" "$INSTDIR\resources\extension"
  WriteRegStr HKCU "Software\Google\Chrome\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "version" "1.0.4"
  WriteRegStr HKCU "Software\Microsoft\Edge\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "path" "$INSTDIR\resources\extension"
  WriteRegStr HKCU "Software\Microsoft\Edge\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "version" "1.0.4"
  WriteRegStr HKCU "Software\BraveSoftware\Brave-Browser\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "path" "$INSTDIR\resources\extension"
  WriteRegStr HKCU "Software\BraveSoftware\Brave-Browser\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc" "version" "1.0.4"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Google\Chrome\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
  DeleteRegKey HKCU "Software\Microsoft\Edge\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\Extensions\oglkcogpmnehcnhnaehelcikpijjblgc"
!macroend
