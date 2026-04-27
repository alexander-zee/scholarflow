"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/usage";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

export async function createProjectAction(formData: FormData) {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionPlan: true, email: true },
  });
  const unlimitedProjects =
    user?.subscriptionPlan === "pro" || isAdminEmail(user?.email);
  if (!unlimitedProjects) {
    const existingCount = await prisma.project.count({ where: { userId } });
    if (existingCount >= 1) {
      redirect("/dashboard/projects/new?error=max-projects");
    }
  }

  const project = await prisma.project.create({
    data: {
      userId,
      title: String(formData.get("title") || ""),
      field: String(formData.get("field") || ""),
      degreeLevel: String(formData.get("degreeLevel") || ""),
      language: String(formData.get("language") || ""),
      researchQuestion: String(formData.get("researchQuestion") || ""),
      description: String(formData.get("description") || ""),
    },
  });

  revalidatePath("/dashboard/projects");
  redirect(`/dashboard/projects/${project.id}`);
}

export async function updateProjectAction(projectId: string, formData: FormData) {
  const userId = await requireUserId();
  const existing = await prisma.project.findUnique({ where: { id: projectId } });
  if (!existing || existing.userId !== userId) throw new Error("Unauthorized");
  await prisma.project.update({
    where: { id: projectId },
    data: {
      title: String(formData.get("title") || ""),
      field: String(formData.get("field") || ""),
      degreeLevel: String(formData.get("degreeLevel") || ""),
      language: String(formData.get("language") || ""),
      researchQuestion: String(formData.get("researchQuestion") || ""),
      description: String(formData.get("description") || ""),
    },
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function deleteProjectAction(projectId: string) {
  const userId = await requireUserId();
  const existing = await prisma.project.findUnique({ where: { id: projectId } });
  if (!existing || existing.userId !== userId) throw new Error("Unauthorized");
  await prisma.project.delete({ where: { id: projectId } });
  revalidatePath("/dashboard/projects");
  redirect("/dashboard/projects");
}

export async function createDocumentSectionAction(projectId: string, formData: FormData) {
  const userId = await requireUserId();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) throw new Error("Project not found");

  await prisma.documentSection.create({
    data: {
      projectId,
      title: String(formData.get("title") || "Untitled section"),
      sectionType: String(formData.get("sectionType") || "chapter"),
      content: String(formData.get("content") || ""),
    },
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
}
