import type {
  Integration,
  ActionField,
  ActionFieldType,
  TriggerDescriptor,
} from "@/lib/integrations/types";

// --- tiny authoring helpers -------------------------------------------------

function req(name: string, type: ActionFieldType, description: string): ActionField {
  return { name, type, required: true, description };
}
function opt(name: string, type: ActionFieldType, description: string): ActionField {
  return { name, type, required: false, description };
}

const RECORD_TRIGGERS: TriggerDescriptor[] = [
  { event: "created", description: "A record was created" },
  { event: "updated", description: "A record was updated" },
  { event: "status_changed", description: "A record's status changed" },
];

const ALL_TRIGGERS: TriggerDescriptor[] = [
  ...RECORD_TRIGGERS,
  { event: "deleted", description: "A record was deleted" },
];

/**
 * The integration catalog. Five are fully implemented (Slack, Webhook, Stripe,
 * Gmail, Jira); the rest are registered with correct, implementable metadata but
 * marked `implemented: false`. All action metadata is accurate enough to build
 * the real call from the stub alone.
 */
export const INTEGRATION_CATALOG: Integration[] = [
  // ---- Fully implemented (5) ----------------------------------------------
  {
    id: "slack",
    displayName: "Slack",
    authType: "oauth2",
    implemented: true,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "send_message",
        displayName: "Send channel message",
        description: "Post a message to a Slack channel.",
        input: [req("channel", "string", "Channel id or name"), req("text", "string", "Message text"), opt("blocks", "array", "Block Kit blocks")],
        output: [req("ts", "string", "Message timestamp id"), req("channel", "string", "Channel id")],
      },
      {
        id: "send_dm",
        displayName: "Send direct message",
        description: "Send a direct message to a user.",
        input: [req("userId", "string", "Slack user id"), req("text", "string", "Message text")],
        output: [req("ts", "string", "Message timestamp id")],
      },
      {
        id: "post_block",
        displayName: "Post formatted block",
        description: "Post a richly formatted Block Kit message.",
        input: [req("channel", "string", "Channel id or name"), req("blocks", "array", "Block Kit blocks")],
        output: [req("ts", "string", "Message timestamp id")],
      },
    ],
  },
  {
    id: "webhook",
    displayName: "Generic Webhook",
    authType: "webhook_secret",
    implemented: true,
    triggers: ALL_TRIGGERS,
    actions: [
      {
        id: "post_payload",
        displayName: "POST payload",
        description: "POST a JSON payload to a configured URL with an HMAC signature.",
        input: [
          req("url", "string", "Destination URL"),
          req("payload", "object", "JSON body to send"),
          req("hmacSignature", "string", "HMAC-SHA256 signature of the body (X-Signature header)"),
        ],
        output: [req("status", "number", "HTTP status code")],
      },
    ],
  },
  {
    id: "stripe",
    displayName: "Stripe",
    authType: "api_key",
    implemented: true,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "create_customer",
        displayName: "Create customer",
        description: "Create a Stripe customer.",
        input: [req("email", "string", "Customer email"), opt("name", "string", "Customer name")],
        output: [req("customerId", "string", "Stripe customer id")],
      },
      {
        id: "create_charge",
        displayName: "Create charge",
        description: "Charge a customer.",
        input: [req("customerId", "string", "Stripe customer id"), req("amount", "number", "Amount in smallest currency unit"), req("currency", "string", "ISO currency code")],
        output: [req("chargeId", "string", "Stripe charge id"), req("status", "string", "Charge status")],
      },
      {
        id: "create_subscription",
        displayName: "Create subscription",
        description: "Subscribe a customer to a price.",
        input: [req("customerId", "string", "Stripe customer id"), req("priceId", "string", "Stripe price id")],
        output: [req("subscriptionId", "string", "Subscription id"), req("status", "string", "Subscription status")],
      },
      {
        id: "issue_refund",
        displayName: "Issue refund",
        description: "Refund a charge in full or part.",
        input: [req("chargeId", "string", "Stripe charge id"), opt("amount", "number", "Partial amount; omit for full refund")],
        output: [req("refundId", "string", "Refund id"), req("status", "string", "Refund status")],
      },
    ],
  },
  {
    id: "gmail",
    displayName: "Gmail / Google Workspace",
    authType: "oauth2",
    implemented: true,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "send_email",
        displayName: "Send email",
        description: "Send an email via Gmail.",
        input: [req("to", "string", "Recipient address"), req("subject", "string", "Subject line"), req("body", "string", "Email body"), opt("cc", "string", "CC address")],
        output: [req("messageId", "string", "Gmail message id")],
      },
      {
        id: "create_calendar_event",
        displayName: "Create calendar event",
        description: "Create a Google Calendar event.",
        input: [req("title", "string", "Event title"), req("startTime", "string", "ISO start time"), req("endTime", "string", "ISO end time"), opt("attendees", "array", "Attendee emails")],
        output: [req("eventId", "string", "Calendar event id")],
      },
    ],
  },
  {
    id: "jira",
    displayName: "Jira",
    authType: "api_key",
    implemented: true,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "create_issue",
        displayName: "Create issue",
        description: "Create a Jira issue.",
        input: [req("projectKey", "string", "Project key"), req("summary", "string", "Issue summary"), req("issueType", "string", "Issue type, e.g. Task"), opt("description", "string", "Description")],
        output: [req("issueKey", "string", "Created issue key")],
      },
      {
        id: "update_status",
        displayName: "Update status",
        description: "Transition an issue to a new status.",
        input: [req("issueKey", "string", "Issue key"), req("status", "string", "Target status")],
        output: [req("ok", "boolean", "Whether the transition succeeded")],
      },
      {
        id: "add_comment",
        displayName: "Add comment",
        description: "Add a comment to an issue.",
        input: [req("issueKey", "string", "Issue key"), req("body", "string", "Comment body")],
        output: [req("commentId", "string", "Comment id")],
      },
      {
        id: "assign_user",
        displayName: "Assign user",
        description: "Assign an issue to a user.",
        input: [req("issueKey", "string", "Issue key"), req("accountId", "string", "Assignee account id")],
        output: [req("ok", "boolean", "Whether the assignment succeeded")],
      },
    ],
  },

  // ---- Registered, correct metadata, not fully implemented ----------------
  {
    id: "whatsapp",
    displayName: "WhatsApp (via Twilio)",
    authType: "api_key",
    implemented: false,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "send_template_message",
        displayName: "Send template message",
        description: "Send an approved WhatsApp template message.",
        input: [req("to", "string", "Recipient phone (E.164)"), req("templateName", "string", "Approved template name"), opt("variables", "object", "Template variable map")],
        output: [req("messageSid", "string", "Twilio message SID")],
      },
      {
        id: "send_notification",
        displayName: "Send notification",
        description: "Send a freeform WhatsApp notification.",
        input: [req("to", "string", "Recipient phone (E.164)"), req("body", "string", "Message body")],
        output: [req("messageSid", "string", "Twilio message SID")],
      },
    ],
  },
  {
    id: "google_sheets",
    displayName: "Google Sheets",
    authType: "oauth2",
    implemented: false,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "append_row",
        displayName: "Append row",
        description: "Append a row to a sheet.",
        input: [req("spreadsheetId", "string", "Spreadsheet id"), req("range", "string", "A1 range, e.g. Sheet1!A:Z"), req("values", "array", "Row values")],
        output: [req("updatedRange", "string", "Updated A1 range")],
      },
      {
        id: "update_cell",
        displayName: "Update cell",
        description: "Update a single cell.",
        input: [req("spreadsheetId", "string", "Spreadsheet id"), req("cell", "string", "A1 cell, e.g. Sheet1!B2"), req("value", "string", "New value")],
        output: [req("ok", "boolean", "Whether the update succeeded")],
      },
      {
        id: "create_tab",
        displayName: "Create sheet tab",
        description: "Create a new tab in a spreadsheet.",
        input: [req("spreadsheetId", "string", "Spreadsheet id"), req("title", "string", "Tab title")],
        output: [req("sheetId", "string", "New sheet/tab id")],
      },
    ],
  },
  {
    id: "salesforce",
    displayName: "Salesforce",
    authType: "oauth2",
    implemented: false,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "upsert_record",
        displayName: "Create/update record",
        description: "Create or update a Lead, Contact, Opportunity, or Account.",
        input: [req("objectType", "string", "Lead | Contact | Opportunity | Account"), req("fields", "object", "Field map")],
        output: [req("recordId", "string", "Salesforce record id")],
      },
    ],
  },
  {
    id: "hubspot",
    displayName: "HubSpot",
    authType: "oauth2",
    implemented: false,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "upsert_contact",
        displayName: "Create/update contact",
        description: "Create or update a contact.",
        input: [req("email", "string", "Contact email"), opt("properties", "object", "Contact properties")],
        output: [req("contactId", "string", "HubSpot contact id")],
      },
      {
        id: "update_deal_stage",
        displayName: "Update deal stage",
        description: "Move a deal to a new stage.",
        input: [req("dealId", "string", "Deal id"), req("stage", "string", "Target stage")],
        output: [req("ok", "boolean", "Whether the update succeeded")],
      },
      {
        id: "add_to_sequence",
        displayName: "Add to sequence",
        description: "Enroll a contact in a sequence.",
        input: [req("contactId", "string", "Contact id"), req("sequenceId", "string", "Sequence id")],
        output: [req("ok", "boolean", "Whether enrollment succeeded")],
      },
    ],
  },
  {
    id: "notion",
    displayName: "Notion",
    authType: "oauth2",
    implemented: false,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "create_page",
        displayName: "Create page",
        description: "Create a page under a parent.",
        input: [req("parentId", "string", "Parent page/database id"), req("properties", "object", "Page properties")],
        output: [req("pageId", "string", "Created page id")],
      },
      {
        id: "update_db_row",
        displayName: "Update database row",
        description: "Update a database row's properties.",
        input: [req("databaseId", "string", "Database id"), req("rowId", "string", "Row/page id"), req("properties", "object", "Properties to set")],
        output: [req("ok", "boolean", "Whether the update succeeded")],
      },
    ],
  },
  {
    id: "airtable",
    displayName: "Airtable",
    authType: "api_key",
    implemented: false,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "create_record",
        displayName: "Create record",
        description: "Create a record in a table.",
        input: [req("baseId", "string", "Base id"), req("table", "string", "Table name"), req("fields", "object", "Field map")],
        output: [req("recordId", "string", "Airtable record id")],
      },
    ],
  },
  {
    id: "twilio_sms",
    displayName: "Twilio SMS",
    authType: "api_key",
    implemented: false,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "send_sms",
        displayName: "Send SMS",
        description: "Send an SMS notification.",
        input: [req("to", "string", "Recipient phone (E.164)"), req("body", "string", "Message body")],
        output: [req("messageSid", "string", "Twilio message SID")],
      },
      {
        id: "trigger_otp",
        displayName: "Trigger OTP",
        description: "Start an OTP verification flow.",
        input: [req("to", "string", "Recipient phone (E.164)")],
        output: [req("verificationSid", "string", "Verification SID")],
      },
    ],
  },
  {
    id: "github",
    displayName: "GitHub",
    authType: "oauth2",
    implemented: false,
    triggers: RECORD_TRIGGERS,
    actions: [
      {
        id: "create_issue",
        displayName: "Create issue",
        description: "Open an issue in a repository.",
        input: [req("repo", "string", "owner/name"), req("title", "string", "Issue title"), opt("body", "string", "Issue body")],
        output: [req("issueNumber", "number", "Created issue number")],
      },
      {
        id: "dispatch_workflow",
        displayName: "Dispatch workflow",
        description: "Trigger a workflow_dispatch event.",
        input: [req("repo", "string", "owner/name"), req("workflowId", "string", "Workflow file or id"), opt("inputs", "object", "Workflow inputs")],
        output: [req("ok", "boolean", "Whether dispatch succeeded")],
      },
    ],
  },
  {
    id: "zapier",
    displayName: "Zapier (via webhook)",
    authType: "webhook_secret",
    implemented: false,
    triggers: ALL_TRIGGERS,
    actions: [
      {
        id: "send_payload",
        displayName: "Send payload",
        description: "POST a structured payload to a Zapier webhook URL.",
        input: [req("webhookUrl", "string", "Zapier catch hook URL"), req("payload", "object", "Structured payload")],
        output: [req("status", "number", "HTTP status code")],
      },
    ],
  },
];
