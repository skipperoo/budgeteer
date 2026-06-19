-- Add 'transaction' as a valid entity_type for invitations
-- so that users can send one-time transactions to other users.
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_entity_type_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_entity_type_check
  CHECK (entity_type IN ('rule', 'account', 'transaction'));
