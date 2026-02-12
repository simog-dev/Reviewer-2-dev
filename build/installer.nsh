; Custom NSIS installer script for Reviewer 2
; Simplified version to avoid integrity check errors

!macro customInstall
  ; Write installation directory to a marker file
  FileOpen $0 "$INSTDIR\install_path.txt" w
  FileWrite $0 "$INSTDIR"
  FileClose $0
!macroend

!macro customUnInstall
  ; Try to close running application before uninstall
  nsExec::Exec 'taskkill /F /IM Reviewer2.exe /T'
  Sleep 1000

  ; Ask user if they want to delete application data
  ; Using /SD IDNO sets "No" as the default for silent uninstalls
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to delete all application data?$\r$\n$\r$\nThis includes:$\r$\n• All imported PDFs and their annotations$\r$\n• Application settings and preferences$\r$\n• Category configurations$\r$\n$\r$\nClick 'No' to keep your data for future use." \
    /SD IDNO \
    IDNO skip_delete

    ; User clicked Yes - delete all app data folders
    RMDir /r "$APPDATA\reviewer-2"
    RMDir /r "$LOCALAPPDATA\reviewer-2-updater"

  skip_delete:
  ; Clean up marker file
  Delete "$INSTDIR\install_path.txt"
!macroend
