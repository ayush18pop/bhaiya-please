import { buttonTextVariants, buttonVariants } from '@/components/ui/button';
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as AlertDialogPrimitive from '@rn-primitives/alert-dialog';
import { Platform, View, type ViewProps } from 'react-native';

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AlertDialogOverlay({ className, ...props }: Omit<AlertDialogPrimitive.OverlayProps, 'asChild'>) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn('absolute bottom-0 left-0 right-0 top-0 z-50 items-center justify-center bg-black/60 p-4', Platform.select({ web: 'fixed' }), className)}
      {...props}
    />
  );
}

function AlertDialogContent({ className, portalHost, ...props }: AlertDialogPrimitive.ContentProps & { portalHost?: string }) {
  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay>
        <AlertDialogPrimitive.Content
          className={cn('z-50 w-full max-w-[380px] gap-4 rounded-xl border border-border bg-background p-5 shadow-lg shadow-black/10', className)}
          {...props}
        />
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
}

const AlertDialogHeader = ({ className, ...props }: ViewProps) => <View className={cn('gap-2', className)} {...props} />;
const AlertDialogFooter = ({ className, ...props }: ViewProps) => <View className={cn('flex-col-reverse gap-2', className)} {...props} />;

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.TitleProps) {
  return <AlertDialogPrimitive.Title className={cn('text-lg font-semibold text-foreground', className)} {...props} />;
}
function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.DescriptionProps) {
  return <AlertDialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
function AlertDialogAction({ className, ...props }: AlertDialogPrimitive.ActionProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ className })}>
      <AlertDialogPrimitive.Action className={cn(buttonVariants(), className)} {...props} />
    </TextClassContext.Provider>
  );
}
function AlertDialogCancel({ className, ...props }: AlertDialogPrimitive.CancelProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant: 'outline' })}>
      <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: 'outline' }), className)} {...props} />
    </TextClassContext.Provider>
  );
}

export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger };
