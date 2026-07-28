export type ToolStage = "application" | "interview" | "offer" | "insight";

export type ToolMeta = {
  id: string;
  stage: ToolStage;
  label: string;
  short: string;
  accent: string;
  contextLabel?: string;
  contextPlaceholder?: string;
  contextChips?: string[];
};

export const AI_TOOLS_META: ToolMeta[] = [
  { id: "cover_letter", stage: "application", label: "Cover Letter", short: "Personalized letter aligning your background to the role.", accent: "indigo", contextLabel: "Extra context (optional)", contextPlaceholder: "Anything specific to highlight (a project, referral, why this company)..." },
  { id: "follow_up_app", stage: "application", label: "Follow Up After Application", short: "Polite check-in when there's been no response.", accent: "emerald", contextLabel: "Extra context (optional)", contextPlaceholder: "How long has it been? Any prior contact?" },
  { id: "interview_prep", stage: "interview", label: "Interview Prep Questions", short: "Likely questions with talking points grounded in your resume.", accent: "violet", contextLabel: "Round type (optional)", contextChips: ["Recruiter Screen", "Hiring Manager", "Technical", "System Design", "Behavioral", "Final / Onsite"] },
  { id: "questions_to_ask", stage: "interview", label: "Questions to Ask", short: "Sharp, curious questions to ask the interviewer.", accent: "sky", contextLabel: "Interviewer role (optional)", contextChips: ["Recruiter", "Hiring Manager", "Peer Engineer", "Skip-level", "Cross-functional partner"] },
  { id: "thank_you", stage: "interview", label: "Thank You After Interview", short: "Short, personal thank-you email.", accent: "amber", contextLabel: "What did you discuss? (optional)", contextPlaceholder: "One thing the interviewer said that stuck with you, project discussed, etc." },
  { id: "follow_up_interview", stage: "interview", label: "Follow Up After Interview", short: "Polite nudge when you haven't heard back.", accent: "emerald", contextLabel: "Days since interview (optional)" },
  { id: "reschedule", stage: "interview", label: "Reschedule Interview", short: "Request to move the interview time.", accent: "orange", contextLabel: "Reason (optional)", contextChips: ["Personal Emergency", "Scheduling Conflict", "Health Issues", "Family Emergency", "Work Commitment"] },
  { id: "decline_interview", stage: "interview", label: "Decline Interview", short: "Gracious decline that keeps the door open.", accent: "rose", contextLabel: "Reason (optional)", contextChips: ["Accepted Another Offer", "Scheduling Conflict", "Personal Reasons", "Location and Commute", "Not Interested in the Role"] },
  { id: "offer_negotiation", stage: "offer", label: "Offer Negotiation", short: "Negotiate salary, equity, or benefits.", accent: "fuchsia", contextLabel: "Negotiation elements", contextChips: ["Base Salary", "Sign-On Bonus", "Equity or Stock Options", "Performance Bonus", "Flexible Working Arrangements", "Vacation Time and Paid Time Off", "Professional Development", "Health Insurance and Benefits", "Retirement Benefits", "Relocation Assistance", "Work Equipment and Home Office Setup"] },
  { id: "offer_acceptance", stage: "offer", label: "Offer Acceptance", short: "Enthusiastic, formal acceptance email.", accent: "emerald", contextLabel: "Anything to confirm? (optional)", contextPlaceholder: "Start date, remote arrangement, sign-on details you want to restate…" },
  { id: "offer_decline", stage: "offer", label: "Offer Decline", short: "Decline while preserving the relationship.", accent: "rose", contextLabel: "Reason (optional)", contextChips: ["Compensation and Benefits", "Better Offer Elsewhere", "Cultural Fit", "Career Goals and Growth Opportunities", "Work-Life Balance", "Location and Commute", "Personal Reasons"] },
  { id: "offer_time_extension", stage: "offer", label: "Offer Time Extension", short: "Ask for more time to decide.", accent: "amber", contextLabel: "Reason (optional)", contextChips: ["Evaluating Multiple Offers", "Personal Circumstances", "Consulting with Family", "Relocation Considerations", "Educational Commitments"] },
];
