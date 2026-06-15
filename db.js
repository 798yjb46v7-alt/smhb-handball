eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdndmx3cHNpYWlmcHlza2R6ZHB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTQzMTMsImV4cCI6MjA5NzA5MDMxM30.Y8vsQWZGHU4QO74_2D8riy-J0pVWm3D6CyJTtcv07kc// ─── SMHB — Couche base de données Supabase ───────────────────────────────
// Remplacez les deux constantes ci-dessous par vos valeurs Supabase :
// Dashboard > Settings > API

const SUPABASE_URL = 'https://ggvlwpsiaifpyskdzdpy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdndmx3cHNpYWlmcHlza2R6ZHB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTQzMTMsImV4cCI6MjA5NzA5MDMxM30.Y8vsQWZGHU4QO74_2D8riy-J0pVWm3D6CyJTtcv07kc';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

export async function signUp({ email, password, fullName, role, categoryId }) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: fullName, role, category_id: categoryId } }
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, categories(name, color)')
    .eq('id', user.id)
    .single();
  return profile;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

// ══════════════════════════════════════════════════════════════
// CATÉGORIES
// ══════════════════════════════════════════════════════════════

export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('min_age', { ascending: false, nullsFirst: true });
  if (error) throw error;
  return data;
}

// ══════════════════════════════════════════════════════════════
// ÉVÉNEMENTS
// ══════════════════════════════════════════════════════════════

export async function getEvents({ categoryId = null, from = null, to = null } = {}) {
  let query = supabase
    .from('events_with_stats')
    .select('*')
    .order('date', { ascending: true })
    .order('time', { ascending: true });

  if (categoryId) query = query.eq('category_id', categoryId);
  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createEvent(event, coachId) {
  const { data, error } = await supabase
    .from('events')
    .insert({ ...event, created_by: coachId })
    .select()
    .single();
  if (error) throw error;

  // Notifier tous les joueurs/parents de la catégorie
  await notifyCategory(event.category_id, {
    type: 'new_event',
    title: `Nouvelle séance : ${event.title}`,
    body: `${event.type === 'match' ? 'Match' : 'Entraînement'} le ${formatDate(event.date)} à ${event.time}`,
    event_id: data.id,
    url: `/#events`,
  });

  return data;
}

export async function updateEvent(id, updates) {
  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  // Notifier les inscrits du changement
  await notifyEventParticipants(id, {
    type: 'change',
    title: `Séance modifiée : ${data.title}`,
    body: `Les informations ont été mises à jour. Vérifiez les nouveaux détails.`,
    event_id: id,
    url: `/#events`,
  });

  return data;
}

export async function deleteEvent(id) {
  // Notifier les inscrits avant suppression
  const { data: ev } = await supabase.from('events').select('title').eq('id', id).single();
  await notifyEventParticipants(id, {
    type: 'cancellation',
    title: `Séance annulée : ${ev?.title}`,
    body: 'Cette séance a été annulée par le coach.',
    url: '/#events',
  });

  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

// Écoute temps réel des événements
export function subscribeToEvents(callback) {
  return supabase
    .channel('events-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, callback)
    .subscribe();
}

// ══════════════════════════════════════════════════════════════
// INSCRIPTIONS
// ══════════════════════════════════════════════════════════════

export async function getRegistrations(eventId) {
  const { data, error } = await supabase
    .from('registrations')
    .select('*, profiles(full_name, avatar_url, category_id)')
    .eq('event_id', eventId);
  if (error) throw error;
  return data;
}

export async function getMyRegistrations(userId) {
  const { data, error } = await supabase
    .from('registrations')
    .select('*, events(*)')
    .or(`player_id.eq.${userId},registered_by.eq.${userId}`);
  if (error) throw error;
  return data;
}

export async function register(eventId, playerId, registeredById = null) {
  const { data, error } = await supabase
    .from('registrations')
    .insert({ event_id: eventId, player_id: playerId, registered_by: registeredById })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function unregister(eventId, playerId) {
  const { error } = await supabase
    .from('registrations')
    .delete()
    .eq('event_id', eventId)
    .eq('player_id', playerId);
  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════
// JOUEURS & ÉQUIPE
// ══════════════════════════════════════════════════════════════

export async function getPlayers({ categoryId = null } = {}) {
  let query = supabase
    .from('players_with_category')
    .select('*')
    .order('full_name');

  if (categoryId) query = query.eq('category_id', categoryId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getChildren(parentId) {
  const { data, error } = await supabase
    .from('parent_children')
    .select('child_id, profiles!parent_children_child_id_fkey(*, categories(name,color))')
    .eq('parent_id', parentId);
  if (error) throw error;
  return data.map(r => r.profiles);
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

export async function getNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function markNotificationRead(id) {
  await supabase.from('notifications').update({ read: true }).eq('id', id);
}

// Insère une notification en base et envoie via Web Push
async function notifyCategory(categoryId, payload) {
  // Récupère tous les joueurs/parents de la catégorie
  const { data: players } = await supabase
    .from('profiles')
    .select('id, push_subscription')
    .eq('category_id', categoryId)
    .in('role', ['player', 'parent']);

  if (!players?.length) return;

  // Insère en base
  const notifs = players.map(p => ({ user_id: p.id, ...payload }));
  await supabase.from('notifications').insert(notifs);

  // Envoie push (via Edge Function Supabase)
  const subscriptions = players.filter(p => p.push_subscription).map(p => p.push_subscription);
  if (subscriptions.length) {
    await supabase.functions.invoke('send-push', {
      body: { subscriptions, payload }
    });
  }
}

async function notifyEventParticipants(eventId, payload) {
  const { data: regs } = await supabase
    .from('registrations')
    .select('player_id, profiles(push_subscription)')
    .eq('event_id', eventId);

  if (!regs?.length) return;
  const notifs = regs.map(r => ({ user_id: r.player_id, ...payload }));
  await supabase.from('notifications').insert(notifs);

  const subscriptions = regs.filter(r => r.profiles?.push_subscription).map(r => r.profiles.push_subscription);
  if (subscriptions.length) {
    await supabase.functions.invoke('send-push', { body: { subscriptions, payload } });
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}
