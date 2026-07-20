import { Suspense } from "react";
import { AcceptInvite } from "./accept-invite";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold">
          Lời mời làm việc
        </h1>
        <p className="mb-6 text-center text-sm opacity-70">
          Đăng nhập hoặc tạo tài khoản bằng đúng email được mời để tham gia
          nhà hàng.
        </p>
        <Suspense>
          <AcceptInvite token={token} />
        </Suspense>
      </div>
    </main>
  );
}
