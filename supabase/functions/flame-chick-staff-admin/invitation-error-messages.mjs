const STAFF_RPC_ERROR_MESSAGES = Object.freeze({
  STAFF_INVITATION_ALREADY_OPEN:
    "An invitation for this email is already open. Refresh the staff list and use or cancel the existing invitation before creating another.",
  STAFF_INVITATION_FINALIZE_NOT_AVAILABLE:
    "This invitation has no linked Auth account, so it cannot be finalized. Cancel the failed record and create a new invitation only after verifying the email address."
});

export function staffRpcErrorMessage(code) {
  if (typeof code !== "string" || !/^[A-Z0-9_]{3,80}$/.test(code)) {
    return "Your staff action was not accepted.";
  }
  return STAFF_RPC_ERROR_MESSAGES[code] ??
    (code === "STAFF_COMMAND_FAILED"
      ? "Your staff action was not accepted."
      : `Your staff action was not accepted (${code}).`);
}
