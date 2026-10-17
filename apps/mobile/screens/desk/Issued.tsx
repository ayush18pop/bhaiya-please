/**
 * E3 Vouches issued (Activity tab in Society desk mode): accountability for the desk. Search, type,
 * dates, expiry (soon in yellow), and Remove vouch with a confirm. Table on wide screens, cards on phones.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Attestation } from '@bhaiya-please/core';
import { Alert, Avatar, Button, ConfirmSheet, Empty, Field, SaveButton, SkeletonCards, Text, toast } from '@/components/bp';
import { Rise } from '@/screens/shared/parts';
import { useCore, useSession } from '@/components/providers';
import { useMyIssued } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { monthYear } from '@/lib/format';
import { fill, useCopy } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deskCopy } from './copy';
import { recordCheck } from './recent';

const fullDate = (unix: number) => new Date(unix * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Issued() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const core = useCore();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const { address, society } = useSession();
  const c = useCopy(deskCopy);
  const now = useNow();
  const issued = useMyIssued();
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<Attestation | null>(null);
  const active = useMemo(() => (issued.data ?? []).filter((a) => a.expiresAt > now).sort((a, b) => b.createdAt - a.createdAt), [issued.data, now]);
  const rows = active.filter((a) => !q.trim() || aliasFor(a.subject).toLowerCase().includes(q.trim().toLowerCase()));
  const type = (a: Attestation) => (a.level === 'resident' ? c.resident : c.idChecked);
  const soon = (a: Attestation) => a.expiresAt - now < 30 * 86400;
  const desk = fill(c.desk, { society: society.name });

  const removeBtn = (a: Attestation) => (
    <Button label={c.remove} variant="destructive" size="sm" full={false} onPress={() => setTarget(a)} className="bg-surface" />
  );

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className={cn('gap-3 border-b-2 border-line pb-3 pt-4', wide ? 'flex-row items-center justify-between px-7' : 'px-4')}>
        <View className="gap-0.5">
          <Text variant="title" className="text-[28px] leading-[30px]">
            {c.issuedTitle}
          </Text>
          <Text className="text-[14px] text-muted">{desk}</Text>
        </View>
        <View className={cn(wide ? 'w-[320px]' : 'w-full')}>
          <Field value={q} onChangeText={setQ} placeholder={c.search} accessibilityLabel={c.search} autoCapitalize="none" autoCorrect={false} />
        </View>
      </View>
      <ScrollView className="flex-1" contentContainerClassName={cn('gap-3 pb-10 pt-4', wide ? 'px-7' : 'px-4')}>
        {issued.isError && !issued.data ? (
          <Alert title={c.loadFailed} actions={<Button label={c.retry} variant="secondary" size="sm" full={false} onPress={() => issued.refetch()} />} />
        ) : !issued.data ? (
          <SkeletonCards n={3} kind="row" />
        ) : !active.length ? (
          <Empty title={c.emptyTitle} body={c.emptyBody} action={{ label: c.next, onPress: () => router.push('/home') }} />
        ) : !rows.length ? (
          <Text className="text-[15px] text-muted">{fill(c.noMatch, { q })}</Text>
        ) : wide ? (
          <View className="overflow-hidden rounded-block border-2 border-paper bg-surface">
            <View className="flex-row border-b-2 border-paper px-3.5 py-2.5">
              {[c.colRunner, c.colType, c.colDate, c.colExpires].map((h, i) => (
                <Text key={h} className={cn('text-[13px] font-bold text-muted', i === 0 ? 'flex-[1.4]' : 'flex-1')}>
                  {h}
                </Text>
              ))}
              <View className="w-[150px]" />
            </View>
            {rows.map((a, i) => (
              <Rise key={a.key} index={i}>
                <View className={cn('min-h-[60px] flex-row items-center px-3.5', i < rows.length - 1 && 'border-b-2 border-line')}>
                  <Pressable onPress={() => router.push(`/desk/check/${a.subject}`)} accessibilityRole="link" className="flex-[1.4] flex-row items-center gap-2.5 active:opacity-70">
                    <Avatar seed={a.subject} size={36} ring="none" />
                    <Text className="text-[15px] font-bold">{aliasFor(a.subject)}</Text>
                  </Pressable>
                  <Text className="flex-1 text-[15px]">{type(a)}</Text>
                  <Text className="flex-1 text-[15px] text-muted">{fullDate(a.createdAt)}</Text>
                  <Text className={cn('flex-1 text-[15px]', soon(a) ? 'font-bold text-yellow' : 'text-muted')}>{`${monthYear(a.expiresAt)}${soon(a) ? ` · ${c.soon}` : ''}`}</Text>
                  <View className="w-[150px] items-end py-2">{removeBtn(a)}</View>
                </View>
              </Rise>
            ))}
          </View>
        ) : (
          rows.map((a, i) => (
            <Rise key={a.key} index={i}>
              <View className="gap-3 rounded-block border-2 border-line bg-surface p-3.5">
                <Pressable onPress={() => router.push(`/desk/check/${a.subject}`)} accessibilityRole="link" className="flex-row items-center gap-3 active:opacity-70">
                  <Avatar seed={a.subject} size={40} ring="none" />
                  <View className="flex-1">
                    <Text className="text-[16px] font-bold">{aliasFor(a.subject)}</Text>
                    <Text className="text-[13px] text-muted">{`${type(a)} · ${fullDate(a.createdAt)}`}</Text>
                  </View>
                </Pressable>
                <View className="flex-row items-center justify-between gap-2">
                  <Text className={cn('text-[14px]', soon(a) ? 'font-bold text-yellow' : 'text-muted')}>{`${c.colExpires} ${monthYear(a.expiresAt)}${soon(a) ? ` · ${c.soon}` : ''}`}</Text>
                  {removeBtn(a)}
                </View>
              </View>
            </Rise>
          ))
        )}
        {active.length ? <Text className="text-[14px] text-muted">{fill(c.count, { n: active.length })}</Text> : null}
      </ScrollView>
      <ConfirmSheet
        open={!!target}
        onClose={() => setTarget(null)}
        title={fill(c.removeTitle, { name: target ? aliasFor(target.subject) : '' })}
        body={fill(c.removeBody, { name: target ? aliasFor(target.subject) : '' })}
        confirm={
          target ? (
            <View className="flex-row gap-3 pt-1">
              <View className="flex-1">
                <Button label={c.keep} variant="secondary" onPress={() => setTarget(null)} />
              </View>
              <View className="flex-1">
                <SaveButton
                  label={c.remove}
                  variant="destructive"
                  onSave={() => core.revokeAttestation(target.key)}
                  onDone={() => {
                    if (address) recordCheck(address, { addr: target.subject, at: Math.floor(Date.now() / 1000), outcome: 'removed' });
                    toast.success(c.removedToast);
                    setTarget(null);
                    void qc.invalidateQueries();
                  }}
                />
              </View>
            </View>
          ) : undefined
        }
      />
    </View>
  );
}
