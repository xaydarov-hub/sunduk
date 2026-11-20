'use client';

import { ReactNode, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useT } from '@/lib/hooks';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** true bo'lsa sabab kiritish maydoni chiqadi. */
  withReason?: boolean;
  reasonRequired?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/** window.confirm o'rniga — telefon va planshetda qulay, ixtiyoriy sabab maydoni bilan. */
export function ConfirmDialog({ open, title, message, confirmLabel, danger, withReason, reasonRequired, onConfirm, onClose }: ConfirmDialogProps) {
  const t = useT();
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const canConfirm = !withReason || !reasonRequired || reason.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="btn-secondary min-h-12">{t('Yo‘q', 'Нет')}</button>
          <button type="button" disabled={!canConfirm} onClick={() => { onConfirm(reason.trim()); onClose(); }} className={`${danger ? 'btn-danger' : 'btn-gold'} min-h-12 disabled:opacity-50`}>
            {confirmLabel || t('Ha', 'Да')}
          </button>
        </div>
      }
    >
      {message && <div className="text-sm text-zinc-300">{message}</div>}
      {withReason && (
        <label className="mt-4 block text-sm text-zinc-400">
          {t('Sabab', 'Причина')}{reasonRequired ? ' *' : ''}
          <textarea
            autoFocus
            value={reason}
            onChange={event => setReason(event.target.value)}
            rows={3}
            className="input-dark mt-1"
            placeholder={t('Masalan: mijoz rad etdi', 'Например: гость отказался')}
          />
        </label>
      )}
    </Modal>
  );
}
