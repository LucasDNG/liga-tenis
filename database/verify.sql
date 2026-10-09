SELECT 'users' table_name,count(*) FROM users;
SELECT 'leagues' table_name,count(*) FROM leagues;
SELECT 'categories' table_name,count(*) FROM categories;
SELECT c.league_id,c.number,count(*) FROM categories c GROUP BY c.league_id,c.number HAVING count(*)<>1;
SELECT category_id,position,count(*) FROM pairs WHERE competition_state<>'inactive' GROUP BY category_id,position HAVING count(*)>1;
SELECT user_id,count(*) FROM active_pair_memberships GROUP BY user_id HAVING count(*)>1;
SELECT pair_id,count(*) FROM wheel_assignment_participants GROUP BY pair_id HAVING count(*)>1;
SELECT wa.id FROM wheel_assignments wa JOIN pairs a ON a.id=wa.pair_a_id JOIN pairs b ON b.id=wa.pair_b_id WHERE wa.status IN('open','result_pending','disputed') AND (a.category_id<>wa.category_id OR b.category_id<>wa.category_id);
SELECT m.id FROM matches m WHERE m.winner_pair_id NOT IN(m.pair_a_id,m.pair_b_id);
SELECT id FROM discipline_reports WHERE reason='other' AND (details IS NULL OR length(trim(details))=0);


SELECT u.id
FROM users u
LEFT JOIN identity_documents d ON d.user_id=u.id
WHERE u.verification_status='pending'
  AND d.user_id IS NULL
  AND u.identity_resubmit_requested_at IS NULL;


SELECT u.id
FROM users u
JOIN identity_documents d ON d.user_id=u.id
WHERE u.identity_resubmit_requested_at IS NOT NULL;


SELECT id
FROM matches
WHERE (result_type='injury_abandonment' AND (
        abandoned_pair_id IS NULL
        OR abandoned_pair_id NOT IN(pair_a_id,pair_b_id)
        OR abandoned_pair_id=winner_pair_id
      ))
   OR (result_type<>'injury_abandonment' AND abandoned_pair_id IS NOT NULL);


SELECT l.id
FROM leagues l
LEFT JOIN league_wheel_state s ON s.league_id=l.id
WHERE s.league_id IS NULL;

SELECT pws.pair_id
FROM pair_wheel_state pws
LEFT JOIN pairs p ON p.id=pws.pair_id
WHERE p.id IS NULL;

SELECT id
FROM pair_duo_state
WHERE member_low_id>=member_high_id
   OR (pending_relegation_category_id IS NULL AND (pending_relegation_losses<>0 OR pending_relegation_started_at IS NOT NULL))
   OR (pending_relegation_category_id IS NOT NULL AND pending_relegation_started_at IS NULL);

SELECT id
FROM wheel_assignments
WHERE (attacker_pair_id IS NULL)<>(defender_pair_id IS NULL)
   OR (attacker_pair_id IS NOT NULL AND (
        attacker_pair_id=defender_pair_id
        OR attacker_pair_id NOT IN(pair_a_id,pair_b_id)
        OR defender_pair_id NOT IN(pair_a_id,pair_b_id)
      ));

SELECT league_id,count(*)
FROM first_place_reigns
WHERE ended_at IS NULL
GROUP BY league_id
HAVING count(*)>1;


SELECT p.id
FROM pairs p
LEFT JOIN pair_wheel_state pws ON pws.pair_id=p.id
WHERE pws.pair_id IS NULL;

WITH exact_duos AS (
  SELECT
    p.id pair_id,
    p.league_id,
    min(pm.user_id) member_low_id,
    max(pm.user_id) member_high_id
  FROM pairs p
  JOIN pair_members pm ON pm.pair_id=p.id
  GROUP BY p.id,p.league_id
  HAVING count(*)=2
)
SELECT d.pair_id
FROM exact_duos d
LEFT JOIN pair_duo_state s
  ON s.league_id=d.league_id
 AND s.member_low_id=d.member_low_id
 AND s.member_high_id=d.member_high_id
WHERE s.id IS NULL;

SELECT pws.pair_id
FROM pair_wheel_state pws
JOIN pairs p ON p.id=pws.pair_id
WHERE p.competition_state='paused'
  AND (pws.inactive_since IS NULL OR pws.return_position_base IS NULL);

SELECT pair_id
FROM pair_wheel_state
WHERE inactive_reason='three_failures'
  AND (inactive_since IS NULL OR auto_reactivate_at IS NULL);

SELECT pds.id
FROM pair_duo_state pds
JOIN categories c ON c.id=pds.pending_relegation_category_id
WHERE pds.pending_relegation_category_id IS NOT NULL
  AND c.league_id<>pds.league_id;

SELECT pair_id
FROM pair_wheel_state
WHERE awaiting_zone_first_match<>(awaiting_zone_kind IS NOT NULL);

SELECT id
FROM pair_duo_state
WHERE pending_relegation_category_id IS NULL
  AND relegation_route_step<>0;



SELECT wa.id
FROM wheel_assignments wa
JOIN first_place_reigns r ON r.id=wa.first_place_reign_id
WHERE wa.first_place_reign_id IS NOT NULL
  AND (
    r.league_id<>wa.league_id
    OR r.pair_id<>wa.defender_pair_id
    OR wa.attacker_pair_id IS NULL
    OR wa.defender_pair_id IS NULL
  );

SELECT id
FROM wheel_no_shows
WHERE status IN('pending','contested','admin_review','accepted')
  AND assignment_id IN(
    SELECT assignment_id
    FROM wheel_no_shows
    WHERE status IN('pending','contested','admin_review','accepted')
    GROUP BY assignment_id
    HAVING count(*)>1
  );
