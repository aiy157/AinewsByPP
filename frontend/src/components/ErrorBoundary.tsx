import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-canvas text-ink-primary px-6">
          <div className="max-w-md w-full rounded-lg border border-rule bg-surface p-6 text-center space-y-3">
            <h1 className="font-heading text-lg font-bold">
              เกิดข้อผิดพลาดในการแสดงผลหน้าเว็บ
            </h1>
            <p className="text-xs text-ink-secondary leading-relaxed">
              กรุณารีเฟรชหน้าเว็บใหม่อีกครั้ง หากยังพบปัญหาสามารถล้างแคชของเบราว์เซอร์ได้
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-xs font-semibold bg-ink-primary text-canvas hover:opacity-90 transition-opacity"
            >
              รีเฟรชหน้าเว็บ
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
