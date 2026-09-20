import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SkeletonProps {
  className?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, count = 1 }) => {
  const items = Array.from({ length: count });

  return (
    <>
      {items.map((_, idx) => (
        <div
          key={idx}
          className={twMerge(clsx('animate-pulse bg-slate-800/60 rounded h-4 w-full mb-2 last:mb-0', className))}
        />
      ))}
    </>
  );
};
