import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import {
  buildReviewPrompt,
  integrityNotice,
  reviewModes,
  type ReviewMode,
} from "@/lib/review-modes";
import { ensureUsageAllowed, incrementUsage } from "@/lib/usage";
import {
  countWords,
  getFallbackModel,
  getInputCharLimit,
  getInputWordLimit,
  getModel,
  getOutputTokenCap,
} from "@/lib/ai-config";

const requestSchema = z.object({
  projectId: z.string().min(1),
  inputText: z.string().min(20),
  mode: z.enum(reviewModes),
});

function fallbackReport(inputText: string) {
  const anchorQuote = inputText.trim().slice(0, 220);
  return {
    overall_score: 70,
    summary: "Draft contains a useful core idea but needs clearer structure and academic precision.",
    strengths: ["Clear topic relevance", "Potentially strong research intent"],
    main_issues: ["Paragraph focus is mixed", "Some claims need evidence or citations"],
    structure_feedback: ["Use a clearer topic sentence in each paragraph."],
    clarity_feedback: ["Define key terms before analysis."],
    academic_tone_feedback: ["Replace conversational wording with discipline-specific wording."],
    methodology_feedback: ["Explain why your selected methodology is appropriate for your question."],
    rewrite_suggestions: [
      {
        original: inputText.slice(0, 160),
        suggestion: "Rewrite this paragraph with one claim, one evidence point, and one short interpretation.",
        reason: "Improves argument flow and readability.",
      },
    ],
    anchor_comments: anchorQuote
      ? [
          {
            quote: anchorQuote,
            comment:
              "This passage is a good place to tighten claim-evidence linkage and remove broad wording.",
            severity: "medium",
          },
        ]
      : [],
    next_steps: ["Revise structure first, then tone and sentence-level edits."],
    integrity_notice: integrityNotice,
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = requestSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid review request." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: payload.data.projectId } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const usageCheck = await ensureUsageAllowed(session.user.id);
  if (!usageCheck.allowed) {
    return NextResponse.json(
      { error: "Monthly AI review limit reached. Upgrade in pricing.", redirectTo: "/pricing" },
      { status: 402 },
    );
  }

  const maxChars = getInputCharLimit();
  const maxWords = getInputWordLimit();
  const wordCount = countWords(payload.data.inputText);
  if (wordCount > maxWords) {
    return NextResponse.json(
      {
        error: `Input is too long. Limit is ${maxWords.toLocaleString()} words (current: ${wordCount.toLocaleString()}).`,
      },
      { status: 400 },
    );
  }

  if (payload.data.inputText.length > maxChars) {
    return NextResponse.json(
      {
        error: `Input is too long. Limit is ${maxChars.toLocaleString()} characters.`,
      },
      { status: 400 },
    );
  }

  let report: Record<string, unknown>;
  try {
    const prompt = buildReviewPrompt(payload.data.inputText, payload.data.mode as ReviewMode);
    const response = await openai.responses.create({
      model: getModel(),
      input: prompt,
      max_output_tokens: getOutputTokenCap(payload.data.mode),
    });
    report = JSON.parse(response.output_text);
    report.integrity_notice = integrityNotice;
  } catch {
    try {
      const fallback = await openai.responses.create({
        model: getFallbackModel(),
        input: buildReviewPrompt(payload.data.inputText, payload.data.mode as ReviewMode),
        max_output_tokens: getOutputTokenCap(payload.data.mode),
      });
      report = JSON.parse(fallback.output_text);
      report.integrity_notice = integrityNotice;
    } catch {
      report = fallbackReport(payload.data.inputText);
    }
  }

  const summary = String(report.summary || "AI feedback generated.");

  await prisma.feedbackReport.create({
    data: {
      projectId: payload.data.projectId,
      userId: session.user.id,
      inputText: payload.data.inputText,
      reportJson: report as Prisma.InputJsonValue,
      summary,
    },
  });

  await incrementUsage(session.user.id);

  return NextResponse.json({ report });
}
