type CancelScheduledNotification = (identifier: string) => Promise<unknown>;

const RETIRED_NOTIFICATION_IDS = ['nuances-trial-ending-reminder'] as const;

export async function cancelRetiredNotifications(
  cancelScheduledNotification: CancelScheduledNotification
): Promise<void> {
  await Promise.all(
    RETIRED_NOTIFICATION_IDS.map((identifier) =>
      cancelScheduledNotification(identifier).catch(() => undefined)
    )
  );
}
