/* Windows toolkit builder: tick apps and tweaks, get one PowerShell script.
   Apps install with winget (built into Windows 10 and 11). Every package ID here was
   checked against the official winget-pkgs repository. Tweaks only change settings for
   the signed-in user (HKCU) and can be undone in Settings. */
(function () {
  'use strict';
  var WG = window.WG, $ = WG.$, esc = WG.esc;
  var root = $('#wt-builder'); if (!root) return;

  var APPS = [
    ['Browsers', [
      ['Mozilla.Firefox', 'Firefox', 'Private, open-source browser.'],
      ['Google.Chrome', 'Google Chrome', ''],
      ['Brave.Brave', 'Brave', 'Chrome-based, blocks ads and trackers.']]],
    ['Everyday', [
      ['7zip.7zip', '7-Zip', 'Opens zip, 7z, rar and more.', 1],
      ['VideoLAN.VLC', 'VLC media player', 'Plays nearly any video or audio file.', 1],
      ['Notepad++.Notepad++', 'Notepad++', 'A much better Notepad.', 1],
      ['voidtools.Everything', 'Everything', 'Finds any file instantly as you type.', 1],
      ['Microsoft.PowerToys', 'PowerToys', 'Microsoft\u2019s power-user add-ons.'],
      ['ShareX.ShareX', 'ShareX', 'Screenshots and screen recording.'],
      ['Discord.Discord', 'Discord', ''],
      ['Zoom.Zoom', 'Zoom', '']]],
    ['Security', [
      ['Bitwarden.Bitwarden', 'Bitwarden', 'Password manager that syncs.'],
      ['KeePassXCTeam.KeePassXC', 'KeePassXC', 'Password manager kept in a local file.'],
      ['Malwarebytes.Malwarebytes', 'Malwarebytes', 'Second-opinion malware scanner.']]],
    ['System & repair', [
      ['WinDirStat.WinDirStat', 'WinDirStat', 'Shows what\u2019s filling your disk.'],
      ['CPUID.CPU-Z', 'CPU-Z', 'CPU, memory and motherboard details.'],
      ['REALiX.HWiNFO', 'HWiNFO', 'Temperatures and every sensor.'],
      ['Microsoft.Sysinternals.Autoruns', 'Autoruns', 'Everything that starts with Windows.'],
      ['Rufus.Rufus', 'Rufus', 'Makes bootable USB sticks.'],
      ['Ventoy.Ventoy', 'Ventoy', 'One USB stick that boots many ISO files.']]],
    ['Network & remote', [
      ['Tailscale.Tailscale', 'Tailscale', 'Reach your home devices from anywhere.'],
      ['PuTTY.PuTTY', 'PuTTY', 'SSH and serial terminal.'],
      ['WinSCP.WinSCP', 'WinSCP', 'Copy files to and from servers.'],
      ['WiresharkFoundation.Wireshark', 'Wireshark', 'See what\u2019s on your network.'],
      ['angryziber.AngryIPScanner', 'Angry IP Scanner', 'Finds devices on your network.']]],
    ['Media', [
      ['Jellyfin.JellyfinMediaPlayer', 'Jellyfin Media Player', 'Desktop app for a Jellyfin server.'],
      ['HandBrake.HandBrake', 'HandBrake', 'Converts and shrinks videos.'],
      ['OBSProject.OBSStudio', 'OBS Studio', 'Record or stream your screen.']]],
    ['Developer', [
      ['Microsoft.WindowsTerminal', 'Windows Terminal', 'Tabs for PowerShell, CMD and WSL.'],
      ['Microsoft.PowerShell', 'PowerShell 7', 'The current PowerShell.'],
      ['Git.Git', 'Git', ''],
      ['Microsoft.VisualStudioCode', 'Visual Studio Code', ''],
      ['Python.Python.3.13', 'Python 3.13', ''],
      ['OpenJS.NodeJS.LTS', 'Node.js LTS', ''],
      ['Docker.DockerDesktop', 'Docker Desktop', 'Needs WSL 2; restart afterwards.']]]
  ];

  var ADV = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
  var TWEAKS = [
    ['ext', 'Show file extensions', 'See .exe, .pdf and so on. Helps spot fake files.', 1,
      "Set-ItemProperty -Path '" + ADV + "' -Name HideFileExt -Value 0"],
    ['hidden', 'Show hidden files', '', 0,
      "Set-ItemProperty -Path '" + ADV + "' -Name Hidden -Value 1"],
    ['thispc', 'Open File Explorer to "This PC"', 'Instead of Home / Quick access.', 0,
      "Set-ItemProperty -Path '" + ADV + "' -Name LaunchTo -Value 1"],
    ['dark', 'Dark mode', 'For Windows and apps.', 0,
      "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' -Name AppsUseLightTheme -Value 0\n  Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' -Name SystemUsesLightTheme -Value 0"],
    ['clip', 'Turn on clipboard history', 'Press Windows+V to paste earlier copies.', 1,
      "New-Item -Path 'HKCU:\\Software\\Microsoft\\Clipboard' -Force | Out-Null\n  Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Clipboard' -Name EnableClipboardHistory -Value 1 -Type DWord"],
    ['websearch', 'Stop Bing web results in Start search', 'Start menu search shows only your apps and files.', 0,
      "New-Item -Path 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer' -Force | Out-Null\n  Set-ItemProperty -Path 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer' -Name DisableSearchBoxSuggestions -Value 1 -Type DWord"],
    ['left', 'Taskbar icons on the left', 'Windows 11 only.', 0,
      "Set-ItemProperty -Path '" + ADV + "' -Name TaskbarAl -Value 0 -Type DWord"],
    ['ctx', 'Full right-click menu', 'Windows 11 only: skips "Show more options".', 0,
      "New-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32' -Value '' -Force | Out-Null"]
  ];
  var UNDO = {
    ctx: "Remove-Item -Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}' -Recurse",
    websearch: "Remove-ItemProperty -Path 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer' -Name DisableSearchBoxSuggestions"
  };

  // Build the checkboxes
  var appsBox = $('#wt-apps'), tweaksBox = $('#wt-tweaks');
  appsBox.innerHTML = APPS.map(function (g, gi) {
    return '<fieldset class="pick-grid"><legend>' + esc(g[0]) + '</legend>' + g[1].map(function (a) {
      return '<label class="check"><input type="checkbox" name="app" value="' + esc(a[0]) + '"' + (a[3] ? ' checked' : '') + '><span>' + esc(a[1]) + (a[2] ? '<small>' + esc(a[2]) + '</small>' : '') + '</span></label>';
    }).join('') + '</fieldset>';
  }).join('');
  tweaksBox.innerHTML = '<fieldset class="pick-grid"><legend>Settings</legend>' + TWEAKS.map(function (t) {
    return '<label class="check"><input type="checkbox" name="tweak" value="' + t[0] + '"' + (t[3] ? ' checked' : '') + '><span>' + esc(t[1]) + (t[2] ? '<small>' + esc(t[2]) + '</small>' : '') + '</span></label>';
  }).join('') + '<label class="check"><input type="checkbox" name="restore" id="wt-restore" checked><span>Create a restore point first<small>A safety net you can roll back to. Asks for admin permission once.</small></span></label></fieldset>';

  var names = {}; APPS.forEach(function (g) { g[1].forEach(function (a) { names[a[0]] = a[1]; }); });

  function picked(name) { return Array.prototype.map.call(root.querySelectorAll('input[name="' + name + '"]:checked'), function (i) { return i.value; }); }

  function script() {
    var apps = picked('app'), tweaks = picked('tweak'), restore = $('#wt-restore').checked;
    var L = [];
    L.push('# wgdively.com Windows toolkit');
    L.push('# Made ' + new Date().toISOString().slice(0, 10) + ' at https://wgdively.com/projects/windows-toolkit/');
    L.push('# Installs ' + apps.length + ' app' + (apps.length === 1 ? '' : 's') + ' with winget' + (tweaks.length ? ' and changes ' + tweaks.length + ' setting' + (tweaks.length === 1 ? '' : 's') + ' for your account' : '') + '.');
    L.push('# Read it before running. Nothing here is hidden or downloaded from anywhere except winget.');
    L.push('#');
    L.push('# How to run: right-click this file and choose "Run with PowerShell".');
    L.push('# If Windows blocks it, open PowerShell in this folder and run:');
    L.push('#   powershell -ExecutionPolicy Bypass -File .\\wgdively-setup.ps1');
    L.push('');
    L.push("$ErrorActionPreference = 'Continue'");
    L.push('function Say($text) { Write-Host "`n== $text" -ForegroundColor Yellow }');
    L.push('');
    L.push("if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {");
    L.push("  Write-Host 'winget is missing. Install or update \"App Installer\" from the Microsoft Store, then run this again.' -ForegroundColor Red");
    L.push("  Start-Process 'ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1'");
    L.push("  Read-Host 'Press Enter to close'; exit 1");
    L.push('}');
    if (restore) {
      L.push('');
      L.push("Say 'Creating a restore point (Windows asks for permission)'");
      L.push("try {");
      L.push("  Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -Command \"Enable-ComputerRestore -Drive C:\\; Checkpoint-Computer -Description ''wgdively toolkit'' -RestorePointType MODIFY_SETTINGS\"'");
      L.push("} catch { Write-Host 'Skipped the restore point (permission was declined).' }");
    }
    if (apps.length) {
      L.push('');
      L.push('$apps = @(');
      apps.forEach(function (id, i) { L.push("  @('" + id + "', '" + names[id].replace(/'/g, "''") + "')" + (i < apps.length - 1 ? ',' : '')); });
      L.push(')');
      L.push('$failed = @()');
      L.push('foreach ($a in $apps) {');
      L.push('  Say "Installing $($a[1])"');
      L.push('  winget install --id $a[0] --exact --source winget --silent --accept-package-agreements --accept-source-agreements');
      L.push('  # 0 = installed. The other two codes mean it was already installed and up to date.');
      L.push('  if (@(0, -1978335189, -1978335135) -notcontains $LASTEXITCODE) { $failed += $a[1] }');
      L.push('}');
    }
    if (tweaks.length) {
      L.push('');
      L.push("Say 'Changing settings'");
      TWEAKS.forEach(function (t) {
        if (tweaks.indexOf(t[0]) === -1) return;
        L.push('# ' + t[1] + (UNDO[t[0]] ? '   (undo: ' + UNDO[t[0]] + ')' : ''));
        L.push('try {');
        L.push('  ' + t[4]);
        L.push("} catch { Write-Host 'Could not change: " + t[1].replace(/'/g, "''") + "' }");
      });
      L.push("Stop-Process -Name explorer -Force   # restarts the taskbar so changes show");
    }
    L.push('');
    L.push("Say 'Done'");
    if (apps.length) L.push("if ($failed.Count) { Write-Host ('These did not install: ' + ($failed -join ', ')) -ForegroundColor Red } else { Write-Host 'Everything installed.' -ForegroundColor Green }");
    L.push("Write-Host 'Some apps (like Docker Desktop) need a restart before they work.'");
    L.push("Read-Host 'Press Enter to close'");
    return L.join('\r\n') + '\r\n';
  }

  var out = $('#wt-out'), count = $('#wt-count');
  function refresh() {
    out.textContent = script();
    var a = picked('app').length, t = picked('tweak').length;
    count.textContent = a + ' app' + (a === 1 ? '' : 's') + ' · ' + t + ' setting' + (t === 1 ? '' : 's');
  }
  root.addEventListener('change', refresh);
  $('#wt-all').addEventListener('click', function () { root.querySelectorAll('input[name="app"]').forEach(function (i) { i.checked = false; }); refresh(); });
  $('#wt-dl').addEventListener('click', function () { WG.downloadText('wgdively-setup.ps1', script(), 'text/plain'); });
  refresh();
})();
