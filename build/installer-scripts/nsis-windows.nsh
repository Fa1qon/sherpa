; build/installer-scripts/nsis-windows.nsh
; ----------------------------------------------------------------------
; Custom NSIS includes for Sherpa UI Client (Windows installer).
; Loaded by electron-builder via `nsis.include` in electron-builder.yml.
;
; Conventions follow electron-builder's NSIS macro hooks:
;   - !macro customHeader
;   - !macro customInit
;   - !macro customInstall
;   - !macro customUnInstall
; See: https://www.electron.build/configuration/nsis
;
; T-L7-01 scope: structure + registry + minimal install message.
; T-L7-02 will populate signing-related macros (uninstall key cleanup
; for signature pin metadata, etc.).

!macro customHeader
  ; Brand display strings shown in installer chrome.
  BrandingText "Sherpa UI Client - local-first, methodology-driven workspace"
!macroend

!macro customInit
  ; --- Auto-remove previous installation ----------------------------------
  ; electron-builder registers the per-user uninstall key under HKCU with
  ; the appId as the subkey name (com.sherpa.ui-client).
  ; We read UninstallString and run it silently before laying down new files
  ; so that stale binaries / native modules from older builds are removed.
  ReadRegStr $R0 HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.sherpa.ui-client" \
    "UninstallString"
  ${If} $R0 != ""
    ; /S — silent uninstall (no UI).
    ; After this ExecWait the old installation directory is empty;
    ; the new installer will recreate it and copy fresh files.
    ExecWait '$R0 /S'
  ${EndIf}
!macroend

!macro customInstall
  ; Register the bundled CLI directory in the Sherpa-scoped registry hive
  ; so external tooling (e.g. `sherpa init` from a shell) can discover the
  ; bundled binary path. Per ADR-006 §Sub-decision (bundled CLI).
  WriteRegStr HKCU "Software\Sherpa\UIClient" "InstallDir"   "$INSTDIR"
  WriteRegStr HKCU "Software\Sherpa\UIClient" "BundledCliDir" "$INSTDIR\resources\bin"
  WriteRegStr HKCU "Software\Sherpa\UIClient" "Version"      "${VERSION}"

  ; File-association placeholders. Real associations (.sherpa-project,
  ; sherpa:// URI handler) are wired in T-L7-02 / T-L7-03 once IPC channels
  ; for them exist; here we only reserve the keys to avoid post-install
  ; permission prompts on subsequent updates.
  WriteRegStr HKCU "Software\Classes\sherpa" "URL Protocol" ""
!macroend

!macro customUnInstall
  ; Remove all Sherpa-scoped registry entries created by customInstall.
  ; Per NF (clean uninstall): user data under %APPDATA%\sherpa-ui-client\
  ; is preserved by default (electron-builder.yml: deleteAppDataOnUninstall=false).
  DeleteRegKey HKCU "Software\Sherpa\UIClient"
  DeleteRegKey HKCU "Software\Classes\sherpa"
!macroend
