/**
 * Stub cho gói `server-only` khi chạy vitest.
 *
 * `import "server-only"` là rào chặn lúc BUILD của Next: nó làm build đỏ nếu một module server
 * bị kéo vào bundle client. Vitest không chạy qua Next nên không resolve được gói này. Stub rỗng
 * giữ nguyên rào chặn ở build thật, đồng thời cho phép unit test các module server.
 */
export {};
