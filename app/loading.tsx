export default function RootLoading() {
  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-slate-700" />
        <p className="mt-3 text-sm text-gray-500">로딩 중...</p>
      </div>
    </div>
  );
}
