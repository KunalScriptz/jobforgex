# Chrome Web Store Listing — JobForge Autofill

> Last Updated: 2026-08-17

## Overview & Status

- **Item Name**: JobForge Autofill
- **Item ID**: `kigpedieokcmgmhhapiminllfkgkmkfo`
- **Current Version**: `1.3.5`
- **Status**: Ready for Resubmission (Fixed CWS Policy Violation)

---

## CWS Rejection & Remediation Log

| Date | Violation ID / Ref | Issue Reported | Root Cause | Fix Applied | Resubmitted |
|------|--------------------|----------------|------------|-------------|-------------|
| 2026-08-17 | `Purple Potassium` | Requesting but not using permissions: `activeTab`, `scripting` | `activeTab` and `scripting` were declared in `manifest.json` but never used in background scripts or popups (content scripts are declaratively matched via `content_scripts.matches`). | Removed `"activeTab"` and `"scripting"` from `manifest.json`. Bumped version to `1.3.5`. Re-built ZIP package. | Pending |

---

## Manifest Permissions Audit

| Permission | Type | Status | Justification |
|------------|------|--------|---------------|
| `storage` | `permissions` | ✅ In Use | Used via `chrome.storage.local` to securely persist the user's JobForge API backend URL (`host`), auth token (`token`), and recent location selections. |
| `activeTab` | `permissions` | ❌ Removed | Not required. Script injection is handled declaratively via `content_scripts.matches`. |
| `scripting` | `permissions` | ❌ Removed | Not required. Dynamic script execution is not used. |

---

## Store Listing Details

- **Extension Name**: JobForge Autofill
- **Short Description**: Save jobs to your JobForge board with one click from any job posting.
- **Detailed Description**:
JobForge Autofill allows job seekers to seamlessly save job listings directly from major job portals into their self-hosted or cloud JobForge dashboard.

Key Features:
- Direct 1-click saving from popular job portals (LinkedIn, Greenhouse, Lever, Ashby, Workday, Indeed, Glassdoor, Naukri, Monster, and more).
- Automatic extraction of Job Title, Company Name, Location, Job URL, and Job Description.
- Custom backend host and security token configuration stored locally on your device.

How to Use:
1. Log in to your JobForge dashboard and copy your API Token from Settings.
2. Click the JobForge icon in your browser toolbar and paste your API Token & Host URL.
3. Browse any supported job site and click the "Save to JobForge" floating button on job listings.

Privacy Note:
JobForge Autofill only processes job posting details on user action. Your authentication credentials and job data are sent strictly to your specified JobForge backend server.

- **Category**: Productivity
- **Single Purpose**: Automatically extracts job posting details from job portals and saves them to the user's JobForge application tracker board.
- **Primary Language**: English
- **Privacy Policy URL**: `https://jobforge.helixos.pro/privacy`

---

## Resubmission Instructions for Developer Dashboard

1. **Locate Build ZIP**: Use the generated ZIP archive at `extension/jobforge-extension-v1.3.5.zip`.
2. **Open Developer Dashboard**: Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/) and select **JobForge Autofill** (`kigpedieokcmgmhhapiminllfkgkmkfo`).
3. **Upload New Package**:
   - Go to **Package** tab.
   - Click **Upload new package**.
   - Select `extension/jobforge-extension-v1.3.5.zip`.
4. **Verify Permissions**:
   - Under **Privacy Practices** -> **Permissions Justification**, confirm only `storage` is listed.
   - Enter the justification: *"Used to save and retrieve the user's API token, server URL, and location preferences locally in the browser."*
5. **Submit for Review**: Click **Submit for Review**.
