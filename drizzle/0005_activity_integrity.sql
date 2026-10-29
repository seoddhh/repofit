CREATE TRIGGER `agent_activity_delete_reports`
BEFORE DELETE ON `agent_activity_summaries`
BEGIN
  DELETE FROM `agent_coach_reports`
  WHERE `user_id` = OLD.`user_id`
    AND EXISTS (SELECT 1 FROM json_each(`bundle`, '$.input.activityIds') WHERE value = OLD.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `agent_report_validate_activity`
BEFORE INSERT ON `agent_coach_reports`
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.`bundle`, '$.input.activityIds') AS selected
  WHERE NOT EXISTS (
    SELECT 1 FROM `agent_activity_summaries` AS activity
    WHERE activity.`id` = selected.value
      AND activity.`user_id` = NEW.`user_id`
      AND activity.`device_id` = NEW.`device_id`
      AND activity.`expires_at` > NEW.`created_at`
  )
)
BEGIN
  SELECT RAISE(ABORT, 'Activity selection is no longer available');
END;
