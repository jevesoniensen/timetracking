# Windows Events Mapping

This document describes the Windows System and Application event IDs used to track work sessions (startup, shutdown, sleep, resume, and logon/logoff), and categorizes them into **Start Events**, **End Events**, and **Ignored Events**.

---

## Start Events

Events that indicate the computer or user session has started or resumed. Each event preserves its distinct descriptive name with `type: "START"`:

| Event ID | Provider / Source | Log | Event Name | Description | Role / Behavior |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **7001** | `Microsoft-Windows-Winlogon` | `System` | `LOGON` | **User Logon Notification** | Triggered when a user logs on to an interactive Windows desktop session. Primary indicator of actual work start on modern systems. |
| **107** | `Microsoft-Windows-Kernel-Power` | `System` | `RESUME` | **System Resumed from Sleep** | Triggered when the computer wakes from Sleep (S3), Hybrid Sleep, or Modern Standby (e.g. opening laptop lid, mouse movement, power button). |
| **6005** | `EventLog` | `System` | `STARTUP` | **Event Log Service Started** | Triggered during a clean cold boot or full reboot when the Windows Event Log service starts up. |
| **1** | `Microsoft-Windows-Power-Troubleshooter` | `System` | `WAKE` | **Returned from Low Power State** | Triggered when the system returns from ACPI sleep/standby to an active working state. |

---

## End Events

Events that indicate the computer or user session has ended, entered sleep, or shut down. Each event preserves its distinct descriptive name with `type: "END"`:

| Event ID | Provider / Source | Log | Event Name | Description | Role / Behavior |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **7002** | `Microsoft-Windows-Winlogon` | `System` | `LOGOFF` | **User Logoff Notification** | Triggered when the user signs out or logs off from the Windows desktop session. Primary indicator of work ending. |
| **42** | `Microsoft-Windows-Kernel-Power` | `System` | `SLEEP` | **System Entering Sleep** | Triggered when the machine enters Sleep or Modern Standby (e.g. closing laptop lid, selecting Start → Sleep, or idle sleep timeout). |
| **1074** | `USER32` | `System` | `USER_SHUTDOWN` | **User Initiated Shutdown / Restart** | Triggered when a user or application explicitly initiates a shutdown, power-off, or restart (e.g. Start → Shut down). |
| **6006** | `EventLog` | `System` | `SHUTDOWN` | **Event Log Service Stopped** | Triggered during a clean, full system shutdown when services stop cleanly. |
| **6008** | `EventLog` | `System` | `UNEXPECTED_SHUTDOWN` | **Unexpected Shutdown** | Logged on reboot if the previous session lost power, crashed (BSOD), or was hard power-cycled without a clean shutdown. |

---

## Ignored Events

Events that occur during system transitions or background operations, but are **not** used as definitive workday boundaries.

| Event ID | Provider / Source | Log | Description | Reason for Ignoring |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `Microsoft-Windows-Kernel-General` | `System` | **System Time Change** | While it fires on wake from sleep, it also fires frequently throughout the day during routine NTP network time updates or daylight saving shifts, leading to false mid-day startups if used alone. |
| **12** | `Microsoft-Windows-Kernel-General` | `System` | **OS Started (Kernel Boot)** | Early kernel startup before user mode and services are running. Precedes Event 6005 and 7001. |
| **13** | `Microsoft-Windows-Kernel-General` | `System` | **OS Shutting Down (Kernel)** | Low-level kernel shutdown. Events 1074, 6006, and 42 already capture the user-level shutdown/sleep trigger earlier and more reliably. |
| **20 / 27 / 30** | `Microsoft-Windows-Kernel-Boot` | `System` | **Kernel Boot / Fast Startup Transition** | Low-level diagnostic transition information regarding fast resume from hibernation file (`hiberfile.sys`). |
| **6009** | `EventLog` | `System` | **OS Version Information** | Informational event logged during boot showing the Windows OS build and version. |
| **6013** | `EventLog` | `System` | **System Uptime Heartbeat** | Logged periodically (usually once a day at midnight) reporting uptime in seconds. Does not indicate work start or end. |
| **4800 / 4801** | `Microsoft-Windows-Security-Auditing` | `Security` | **Workstation Locked / Unlocked** | Requires elevated Administrator privileges to query the Security log; can be noisy during brief screen-lock timeouts or screen saver triggers. |
| **4624 / 4634** | `Microsoft-Windows-Security-Auditing` | `Security` | **Account Logon / Logoff** | Generates hundreds of events daily for background service accounts (DWM, SYSTEM, NetworkService), scheduled tasks, and network file shares. |


Events that occur during system transitions or background operations, but are **not** used as definitive workday boundaries.

| Event ID | Provider / Source | Log | Description | Reason for Ignoring |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `Microsoft-Windows-Kernel-General` | `System` | **System Time Change** | While it fires on wake from sleep, it also fires frequently throughout the day during routine NTP network time updates or daylight saving shifts, leading to false mid-day startups if used alone. |
| **12** | `Microsoft-Windows-Kernel-General` | `System` | **OS Started (Kernel Boot)** | Early kernel startup before user mode and services are running. Precedes Event 6005 and 7001. |
| **13** | `Microsoft-Windows-Kernel-General` | `System` | **OS Shutting Down (Kernel)** | Low-level kernel shutdown. Events 1074, 6006, and 42 already capture the user-level shutdown/sleep trigger earlier and more reliably. |
| **20 / 27 / 30** | `Microsoft-Windows-Kernel-Boot` | `System` | **Kernel Boot / Fast Startup Transition** | Low-level diagnostic transition information regarding fast resume from hibernation file (`hiberfile.sys`). |
| **6009** | `EventLog` | `System` | **OS Version Information** | Informational event logged during boot showing the Windows OS build and version. |
| **6013** | `EventLog` | `System` | **System Uptime Heartbeat** | Logged periodically (usually once a day at midnight) reporting uptime in seconds. Does not indicate work start or end. |
| **4800 / 4801** | `Microsoft-Windows-Security-Auditing` | `Security` | **Workstation Locked / Unlocked** | Requires elevated Administrator privileges to query the Security log; can be noisy during brief screen-lock timeouts or screen saver triggers. |
| **4624 / 4634** | `Microsoft-Windows-Security-Auditing` | `Security` | **Account Logon / Logoff** | Generates hundreds of events daily for background service accounts (DWM, SYSTEM, NetworkService), scheduled tasks, and network file shares. |
## Ignored Events