CREATE POLICY "Authenticated users can insert notifications for mentions"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);