'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';
import styles from './DeliverySettings.module.css';

export interface DeliveryZoneView {
  id: string;
  name: string;
  fee: number;
  coverage: string[];
}

type FormMode = { kind: 'closed' } | { kind: 'adding' } | { kind: 'editing'; zoneId: string };

function formatNaira(kobo: number): string {
  return '\u20A6' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 });
}

function parseCoverage(raw: string): string[] {
  const seen = new Set<string>();
  const areas: string[] = [];
  for (const part of raw.split(',')) {
    const label = part.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    areas.push(label);
  }
  return areas;
}

export function DeliverySettings({ zones }: { zones: DeliveryZoneView[] }) {
  const router = useRouter();

  const [mode, setMode] = useState<FormMode>({ kind: 'closed' });
  const [name, setName] = useState('');
  const [nairaFee, setNairaFee] = useState('');
  const [coverageText, setCoverageText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  function openAddForm() {
    setName('');
    setNairaFee('');
    setCoverageText('');
    setError(null);
    setConfirmingDeleteId(null);
    setMode({ kind: 'adding' });
  }

  function openEditForm(zone: DeliveryZoneView) {
    setName(zone.name);
    setNairaFee((zone.fee / 100).toString());
    setCoverageText(zone.coverage.join(', '));
    setError(null);
    setConfirmingDeleteId(null);
    setMode({ kind: 'editing', zoneId: zone.id });
  }

  function closeForm() {
    setMode({ kind: 'closed' });
    setError(null);
  }

  function validate(): { name: string; feeKobo: number; coverage: string[] } | null {
    const trimmedName = name.trim();
    const fee = Number(nairaFee);

    if (!trimmedName) {
      setError('Please give the zone a name.');
      return null;
    }
    if (trimmedName.length > 100) {
      setError('Zone name must be at most 100 characters.');
      return null;
    }
    if (!nairaFee.trim() || !Number.isFinite(fee) || fee < 0) {
      setError('Please enter a valid delivery fee.');
      return null;
    }
    const coverage = parseCoverage(coverageText);
    if (coverage.length === 0) {
      setError('Add at least one area this zone covers.');
      return null;
    }
    if (coverage.length > 50) {
      setError('A zone can have at most 50 coverage areas.');
      return null;
    }
    return { name: trimmedName, feeKobo: Math.round(fee * 100), coverage };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const payload = validate();
    if (!payload) return;

    setIsSaving(true);
    try {
      const isEdit = mode.kind === 'editing';
      const url =
        isEdit ? `/api/settings/delivery-zones/${mode.zoneId}` : '/api/settings/delivery-zones';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { name: payload.name, fee: payload.feeKobo, coverage: payload.coverage }
            : payload,
        ),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) {
        setError(data?.error ?? 'Could not save the delivery zone. Please try again.');
        return;
      }

      closeForm();
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(zoneId: string) {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/settings/delivery-zones/${zoneId}`, {
        method: 'DELETE',
      });

      if (!res.ok && res.status !== 204) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not delete the delivery zone. Please try again.');
        return;
      }

      setConfirmingDeleteId(null);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const formOpen = mode.kind !== 'closed';

  return (
    <div>
      <div className={styles.headerRow}>
        <h2 className={styles.sectionTitle}>Delivery settings</h2>
        {!formOpen && (
          <Button
            variant="secondary"
            size="sm"
            onClick={openAddForm}
            data-testid="add-delivery-zone-button"
          >
            Add delivery zone
          </Button>
        )}
      </div>

      <p className={styles.sectionBody}>
        Set your delivery zones and fees so customers see the right delivery
        cost at checkout.
      </p>

      {error && (
        <p role="alert" className={styles.errorBox}>
          {error}
        </p>
      )}

      {formOpen && (
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="delivery-zone-name" className={styles.label}>
                Zone name
              </label>
              <input
                id="delivery-zone-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="e.g. Lagos Mainland"
                className={styles.input}
                disabled={isSaving}
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="delivery-zone-fee" className={styles.label}>
                Delivery fee (₦)
              </label>
              <input
                id="delivery-zone-fee"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={nairaFee}
                onChange={(e) => setNairaFee(e.target.value)}
                placeholder="e.g. 1500"
                className={styles.input}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="delivery-zone-coverage" className={styles.label}>
              Areas served
            </label>
            <input
              id="delivery-zone-coverage"
              type="text"
              value={coverageText}
              onChange={(e) => setCoverageText(e.target.value)}
              placeholder="e.g. Yaba, Surulere, Ikeja"
              className={styles.input}
              disabled={isSaving}
            />
            <span className={styles.hint}>
              Separate each area with a comma.
            </span>
          </div>

          <div className={styles.formActions}>
            <Button type="submit" isLoading={isSaving}>
              {mode.kind === 'editing' ? 'Save changes' : 'Add zone'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={closeForm}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {zones.length === 0 && !formOpen && (
        <p className={styles.emptyText}>
          No delivery zones yet. Add your first zone so customers can choose how
          their orders arrive.
        </p>
      )}

      {zones.length > 0 && (
        <div className={styles.zoneList}>
          {zones.map((zone) =>
            mode.kind === 'editing' && mode.zoneId === zone.id ? null : (
              <div key={zone.id} className={styles.zoneRow}>
                <div className={styles.zoneInfo}>
                  <div className={styles.zoneName}>{zone.name}</div>
                  {zone.coverage.length > 0 && (
                    <ul className={styles.coverageList} aria-label={`Areas covered by ${zone.name}`}>
                      {zone.coverage.map((area) => (
                        <li key={area} className={styles.coverageBadge}>
                          {area}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <span className={styles.feePill}>{formatNaira(zone.fee)}</span>
                <div className={styles.zoneActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditForm(zone)}
                    disabled={isSaving}
                    aria-label={`Edit ${zone.name}`}
                  >
                    Edit
                  </Button>
                  {confirmingDeleteId === zone.id ? (
                    <>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(zone.id)}
                        isLoading={isSaving}
                      >
                        Confirm delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingDeleteId(null)}
                        disabled={isSaving}
                      >
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingDeleteId(zone.id)}
                      disabled={isSaving}
                      aria-label={`Delete ${zone.name}`}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
