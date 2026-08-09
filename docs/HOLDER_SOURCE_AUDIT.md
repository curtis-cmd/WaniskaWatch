# Recorded-holder source audit

Waniskâ Watch treats a missing holder as a source-completeness issue, not as evidence that a
claim, lease, licence or project has no holder. Every published record is classified as one of:

- `published` — a holder, owner, applicant, operator or proponent name was reproduced from the
  cited government source;
- `published-field-empty` — the government dataset contains a mapped holder field but the field
  is blank for that record;
- `government-gis-omits-holder` — the government GIS layer does not publish a holder field and a
  separate registry integration is still required; or
- `registry-checked-unavailable` — the current public registry was checked but no holder name was
  returned for that record.

The automated audit blocks publication when a configured government holder field is lost during
normalization. It also verifies that published-holder and review-required totals reconcile to the
current record count.

| Jurisdiction | Holder source used | Current treatment |
| --- | --- | --- |
| Manitoba | iMaQs public Mining Search exports for claims, exploration licences, mineral leases and mining-claim leases | Registry export is joined by disposition number for all current published statuses. |
| British Columbia | Mineral Titles Online/DataBC tenure and ownership view | Owners and published percentages are joined to current title geometry. |
| Alberta | Alberta mineral-agreement GIS; AMI/ETS contains participant detail | GIS omits participants. Records remain unpublished while the source is unavailable; AMI participant integration remains required. |
| Saskatchewan | MARS mineral dispositions `OWNERS` field | Recorded holders are published for current dispositions. Mine-location points without an operator field are flagged for review. |
| Ontario | MLAS holder fields for claims and early-exploration instruments | Those holder fields are published. Lease/licence layers and producing-mine points that omit holder/operator fields are flagged when Ontario is republished. |
| New Brunswick | GeoNB geometry plus NB e-CLAIMS guest-registry active-title export | Current holders are joined by right number; unmatched records are flagged for review. |
| Nova Scotia | NovaROC public active-title Excel export | Active exploration-licence and mineral-lease holders are joined by right number. |
| Newfoundland and Labrador | Mineral Lands `CLIENT_NAME` field | Published names are retained; blank government values are flagged for review. |
| Yukon | GeoYukon `OWNER_NAME` fields | Published owners are retained for current placer and quartz claims and leases. |
| Northwest Territories | GNWT mineral-tenure `OWNERS`/`OWNER` fields | Published tenure holders are retained. Producing-mine and advanced-project points without an operator field are flagged when NWT is republished. |
| Nunavut | CIRNAC `OWNERS`/`OWNER` fields | Published holders are retained for current claims, leases and coal exploration licences. |
| Quebec | GESTIM active-title holder records | Published title holders and percentages are joined to each current title. |

Company and individual names are reproduced as recorded in the cited public sources for
identification and research. Inclusion does not imply affiliation, endorsement, wrongdoing,
consultation, consent or operational activity beyond the status displayed. Users must verify the
record with the responsible registry before acting.
