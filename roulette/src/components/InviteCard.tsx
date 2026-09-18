import { ShareNetworkIcon } from '@phosphor-icons/react';
import { QRCodeSVG } from 'qrcode.react';
import type { ReactNode } from 'react';
import { button } from './ui';

interface Props {
  code: string;
  url: string;
  onShare: () => void;
  /** Smaller QR and no URL line, for the middle of the table. */
  compact?: boolean;
  children?: ReactNode;
}

export default function InviteCard({ code, url, onShare, compact = false, children }: Props) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-sm text-slate-400">Room code</p>
      <p className="font-mono text-3xl font-semibold tracking-[0.25em] text-slate-50 sm:text-4xl">{code}</p>
      <div className="mt-3 rounded-xl bg-slate-50 p-2.5 sm:p-3">
        <QRCodeSVG
          value={url}
          bgColor="#f8fafc"
          fgColor="#020617"
          className={compact ? 'size-24 sm:size-32 lg:size-36' : 'size-44 sm:size-48'}
          title={`QR code to join room ${code}`}
        />
      </div>
      {!compact && <p className="mt-3 max-w-64 text-xs break-all text-slate-400">{url}</p>}
      <div className={`mt-3 flex w-full gap-2 ${compact ? 'max-w-56' : ''}`}>
        <button onClick={onShare} className={`${button.primary} min-h-11 flex-1 px-4`}>
          <ShareNetworkIcon size={18} weight="bold" aria-hidden />
          Share link
        </button>
        {children}
      </div>
    </div>
  );
}
