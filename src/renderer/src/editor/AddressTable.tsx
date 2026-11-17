// Address overview (EDT-6): every accessory and feedback address in the
// project, sortable and filterable by station, kind, address and name.
import {useMemo, useState} from 'react';
import {AddressRow, buildAddressTable} from '../../../model/addressTable';
import {Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {revealElements} from './reveal';

type SortKey = 'viewName' | 'name' | 'kind' | 'address';

const compare = (a: AddressRow, b: AddressRow, key: SortKey) => {
  const av = a[key];
  const bv = b[key];
  if (typeof av === 'number' && typeof bv === 'number') {
    return av - bv;
  }
  return String(av).localeCompare(String(bv), 'en', {numeric: true});
};

export const AddressTable = ({project}: {project: Project}) => {
  const rows = useMemo(() => buildAddressTable(project), [project]);
  const [sort, setSort] = useState<{key: SortKey; ascending: boolean}>({
    key: 'address',
    ascending: true,
  });
  const [viewFilter, setViewFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [search, setSearch] = useState('');

  const kinds = [...new Set(rows.map((row) => row.kind))];
  const shown = rows
    .filter((row) => !viewFilter || row.viewId === viewFilter)
    .filter((row) => !kindFilter || row.kind === kindFilter)
    .filter((row) => {
      const text = search.trim().toLowerCase();
      return (
        !text ||
        row.name.toLowerCase().includes(text) ||
        String(row.address).toLowerCase().includes(text)
      );
    })
    .sort((a, b) => (sort.ascending ? 1 : -1) * compare(a, b, sort.key));

  const header = (key: SortKey, label: string) => (
    <th
      aria-sort={
        sort.key === key
          ? sort.ascending
            ? 'ascending'
            : 'descending'
          : 'none'
      }
    >
      <button
        type="button"
        className="table-sort"
        onClick={() =>
          setSort((current) => ({
            key,
            ascending: current.key === key ? !current.ascending : true,
          }))
        }
      >
        {label}
        {sort.key === key ? (sort.ascending ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  return (
    <div className="address-table">
      <div className="table-filters">
        <select
          value={viewFilter}
          onChange={(event) => setViewFilter(event.target.value)}
          aria-label={strings.addressTable.station}
        >
          <option value="">{strings.addressTable.allStations}</option>
          {project.views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </select>
        <select
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value)}
          aria-label={strings.addressTable.kind}
        >
          <option value="">{strings.addressTable.allKinds}</option>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {strings.kinds[kind] ?? kind}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder={strings.addressTable.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {rows.length === 0 ? (
        <p className="muted">{strings.addressTable.empty}</p>
      ) : (
        <table>
          <thead>
            <tr>
              {header('address', strings.addressTable.address)}
              <th>{strings.addressTable.decoder}</th>
              {header('kind', strings.addressTable.kind)}
              {header('name', strings.addressTable.name)}
              {header('viewName', strings.addressTable.station)}
              <th>{strings.addressTable.detail}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.key}
                className={row.conflict ? 'conflict' : undefined}
                onClick={() =>
                  row.elementId && revealElements(row.viewId, [row.elementId])
                }
              >
                <td>
                  {row.address}
                  {row.addressType !== 'accessory' &&
                    ` (${strings.addressTable.types[row.addressType]})`}
                  {row.conflict && (
                    <strong>{` ⚠ ${strings.addressTable.conflict}`}</strong>
                  )}
                </td>
                <td>
                  {row.dccAddress !== undefined
                    ? `${row.dccAddress} / ${(row.port ?? 0) + 1}`
                    : ''}
                </td>
                <td>{strings.kinds[row.kind] ?? row.kind}</td>
                <td>{row.name}</td>
                <td>{row.viewName}</td>
                <td>
                  {row.detail
                    ? (strings.positions[row.detail] ?? row.detail)
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
