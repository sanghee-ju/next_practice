"use server";
import { sql } from "@vercel/postgres";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: "Please select a customer",
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: "Please Enter an amount greater than $0." }),
  status: z.enum(["pending", "paid"], {
    invalid_type_error: "Please Select an Invoice Status",
  }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  const validateFields = CreateInvoice.safeParse({
    customerId: formData.get("customerId"),
    amount: formData.get("amount"),
    status: formData.get("status"),
  });

  if (!validateFields.success) {
    return {
      errors: validateFields.error.flatten().fieldErrors,
      message: "Missing Fields. Failed to Create Invoices.",
    };
  }
  const { customerId, amount, status } = validateFields.data;

  // 부동 소수점 오류를 방지하기 위해 센트로 처리
  const amountInCents = amount * 100;
  // 날짜 형태 YYYY-MM-DD로 변환하기
  const date = new Date().toISOString().split("T")[0];

  try {
    //db에 데이터 삽입하기
    await sql`
    INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${customerId},${amountInCents},${status},${date})`;
  } catch (e) {
    return { message: "Database Error: Failed to Create Invoice" };
  }

  // 재유효화
  revalidatePath("/dashboard/invoices");
  redirect("dashboard/invoices");
}

export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData
) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get("customerId"),
    amount: formData.get("amount"),
    status: formData.get("status"),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      messages: "Missing Fields. Failed to Update Invoice.",
    };
  }
  const { customerId, amount, status } = validatedFields.data;

  const amountInCents = amount * 100;

  try {
    await sql`
    UPDATE invoices
    SET customer_id=${customerId}, amount=${amountInCents}, status = ${status}
    WHERE id=${id}
    `;
  } catch (e) {
    return { message: "Database Error: Failed to Update Invoice" };
  }

  revalidatePath("/dashboard/invoices");
  redirect("/dashboard/invoices");
}

export async function deleteInvoice(id: string) {
  try {
    await sql`
    DELETE FROM invoices WHERE id=${id}
    `;
  } catch (e) {
    return { message: "Database Error: Failed to Delete Invoice" };
  }

  revalidatePath("/dashboard/invoices");
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData
) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials.";
        default:
          return "Something went wrong.";
      }
    }
    throw error;
  }
}
