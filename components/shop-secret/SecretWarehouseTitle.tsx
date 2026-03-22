"use client";

import Image from "next/image";

type Props = {
  /** 목록·관리(lg) / 소개 카드(md) */
  size?: "lg" | "md";
  className?: string;
};

/**
 * 제작한 PNG 로고 (`public/shop-secret/title.png`).
 * 가로 배너 비율 — max-width로만 스케일, 비율은 이미지 intrinsic에 맡김.
 */
export default function SecretWarehouseTitle({ size = "lg", className = "" }: Props) {
  const sizeClass =
    size === "lg"
      ? "h-auto w-full max-w-[min(100%,22rem)] sm:max-w-md md:max-w-lg"
      : "h-auto w-full max-w-[min(100%,18rem)] sm:max-w-xs";

  return (
    <h1 className={`m-0 inline-block ${className}`}>
      <Image
        src="/shop-secret/title.png"
        alt="업자들의 비밀창고"
        width={1200}
        height={240}
        className={`${sizeClass} object-contain object-left`}
        sizes={size === "lg" ? "(max-width: 768px) 90vw, 32rem" : "(max-width: 640px) 85vw, 18rem"}
        priority
      />
    </h1>
  );
}
