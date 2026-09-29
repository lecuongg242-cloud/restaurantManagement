; desktop/build/installer.nsh - buoc them cho bo cai NSIS (P21 DESK-09).
; Go app thi xoa ca khoa tu khoi dong cung Windows ma app ghi luc chay (app.setLoginItemSettings, ten gia tri =
; AppUserModelId "vn.techmenu.thungan"). Khong xoa thi Windows con tro toi tep da go.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "vn.techmenu.thungan"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "vn.techmenu.thungan"
!macroend
