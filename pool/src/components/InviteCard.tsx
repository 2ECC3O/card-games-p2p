import { QRCodeSVG } from 'qrcode.react';
import type { ReactNode } from 'react';
import { button } from '../../../shared/ui';

interface Props {
  code: string;
  url: string;
  onShare: () => void;
  /** Smaller QR and no URL line, for the middle of the table. */
  compact?: boolean;
  children?: ReactNode;
}

export default function InviteCard({ code, url, onShare, compact = false, children }: Props) {
  return <div className="pool-invite">
    <p>Room code</p><strong>{code}</strong>
    <QRCodeSVG value={url} bgColor="#f8fafc" fgColor="#132920" className={compact ? 'pool-invite-qr small' : 'pool-invite-qr'} title={`QR code to join room ${code}`} />
    {!compact && <small>{url}</small>}
    <div><button onClick={onShare} className={button.primary}>Share link</button>{children}</div>
  </div>;
}
