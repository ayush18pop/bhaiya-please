/** D8 Language: English / हिन्दी / ಕನ್ನಡ. Applies instantly; stored on this phone. */
import { OptionCard, Screen, Text } from '@/components/bp';
import { Rise } from '@/screens/shared/parts';
import { useSession } from '@/components/providers';
import { LANGUAGES, useCopy } from '@/lib/i18n';
import { sharedCopy } from '@/screens/shared/copy';

export default function Language() {
  const c = useCopy(sharedCopy).language;
  const { prefs, setPrefs } = useSession();
  return (
    <Screen title={c.title}>
      {LANGUAGES.map((l, i) => (
        <Rise key={l.id} index={i}>
          <OptionCard title={l.native} body={l.native !== l.label ? l.label : undefined} selected={prefs.language === l.id} onPress={() => setPrefs({ language: l.id })} />
        </Rise>
      ))}
      <Text className="text-[14px] text-muted">{c.hint}</Text>
    </Screen>
  );
}
