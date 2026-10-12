-- FSA-06 Aldo Fork 15 and FSA-08 Red Star 3P: the spoke counts the photos actually show (12 and 15; both were 10).
-- Mirrors data/configuratorData.ts. Nothing else changes in the catalogue: the new FSA-12 and FSA-13 faces replace the
-- files /rim-faces/forged_fsa_12.png and /rim-faces/forged_fsa_13.png in place, and the FORGED lettering on FSA-06's centre
-- cap is set in code (services/rimFaces.ts RIM_CAP_TEXT). The wheels' spin frames are static files in the repo.
update public.wheels set spoke_count = 12 where id = 'forged_fsa_06';
update public.wheels set spoke_count = 15 where id = 'forged_fsa_08';
