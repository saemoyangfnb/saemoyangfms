import React, { useState, useEffect } from 'react';
import { salesDb as db } from '../../firebase';
import { collection, getDocs, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { TeamSetting, BrandId } from '../../types';
import { Plus, X, Trash2, Edit2, Users } from 'lucide-react';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';

interface Props {
  brandId: BrandId;
  onClose: () => void;
}

export function TeamSettingsModal({ brandId, onClose }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [teams, setTeams] = useState<TeamSetting[]>([]);
  const [loading, setLoading] = useState(true);

  // New Team states
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('blue');

  // Editing states
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamColor, setEditTeamColor] = useState('blue');
  const [newMemberName, setNewMemberName] = useState('');

  const PRESET_COLORS = [
    { id: 'blue', bgClass: 'bg-blue-500' },
    { id: 'rose', bgClass: 'bg-rose-500' },
    { id: 'emerald', bgClass: 'bg-emerald-500' },
    { id: 'amber', bgClass: 'bg-amber-500' },
    { id: 'purple', bgClass: 'bg-purple-500' },
    { id: 'cyan', bgClass: 'bg-cyan-500' },
    { id: 'pink', bgClass: 'bg-pink-500' },
    { id: 'slate', bgClass: 'bg-slate-500' },
  ];

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'team_settings'));
      const data: TeamSetting[] = [];
      snap.forEach(d => {
        const t = d.data() as TeamSetting;
        if (t.brandId === brandId) data.push(t);
      });
      setTeams(data);
    } catch (err) {
      toast.error('팀 설정 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, [brandId]);

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      const id = `team_${Date.now()}`;
      const newTeam: TeamSetting = {
        id,
        brandId,
        name: newTeamName.trim(),
        color: newTeamColor,
        members: []
      };
      await setDoc(doc(db, 'team_settings', id), newTeam);
      toast.success('팀이 추가되었습니다.');
      setNewTeamName('');
      setShowAddTeam(false);
      fetchTeams();
    } catch (err) {
      toast.error('팀 추가 실패');
    }
  };

  const handleUpdateTeamName = async () => {
    if (!editingTeamId || !editTeamName.trim()) return;
    try {
      await updateDoc(doc(db, 'team_settings', editingTeamId), { 
        name: editTeamName.trim(),
        color: editTeamColor
      });
      setEditingTeamId(null);
      fetchTeams();
    } catch (err) {
      toast.error('팀명 수정 실패');
    }
  };

  const handleDeleteTeam = async (id: string, name: string) => {
    const ok = await confirm({ title: '팀 삭제', message: `${name}을 삭제하시겠습니까?`, variant: 'danger', confirmLabel: '삭제' });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'team_settings', id));
      toast.success('삭제되었습니다.');
      fetchTeams();
    } catch (err) {
      toast.error('삭제 실패');
    }
  };

  const handleAddMember = async (team: TeamSetting) => {
    if (!newMemberName.trim()) return;
    try {
      const newMembers = [...team.members, { id: `member_${Date.now()}`, name: newMemberName.trim() }];
      await updateDoc(doc(db, 'team_settings', team.id), { members: newMembers });
      setNewMemberName('');
      fetchTeams();
    } catch (err) {
      toast.error('멤버 추가 실패');
    }
  };

  const handleDeleteMember = async (team: TeamSetting, memberId: string) => {
    try {
      const newMembers = team.members.filter(m => m.id !== memberId);
      await updateDoc(doc(db, 'team_settings', team.id), { members: newMembers });
      fetchTeams();
    } catch (err) {
      toast.error('멤버 삭제 실패');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-slate-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">팀 및 SV 구성 설정</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {loading ? (
             <div className="text-center py-10 text-slate-400">데이터 불러오는 중...</div>
          ) : (
             <>
               <div className="flex justify-end">
                 <button 
                  onClick={() => setShowAddTeam(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 text-sm font-semibold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                 >
                   <Plus size={14} /> 새 팀 추가
                 </button>
               </div>

               {showAddTeam && (
                 <div className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                   <div className="flex items-center gap-2">
                     <input 
                       value={newTeamName}
                       onChange={e => setNewTeamName(e.target.value)}
                       placeholder="예: 1팀 (호남권)"
                       className="flex-1 px-3 py-1.5 text-sm rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none"
                       autoFocus
                     />
                     <button onClick={handleAddTeam} className="px-3 py-1.5 text-sm bg-slate-900 text-white dark:bg-blue-600 rounded">추가</button>
                     <button onClick={() => setShowAddTeam(false)} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">취소</button>
                   </div>
                   <div className="flex items-center gap-2 mt-1">
                     <span className="text-xs font-semibold text-slate-500">팀 컬러:</span>
                     <div className="flex gap-1.5">
                       {PRESET_COLORS.map(c => (
                         <button 
                           key={c.id} 
                           onClick={() => setNewTeamColor(c.id)}
                           className={`w-5 h-5 rounded-full ${c.bgClass} ${newTeamColor === c.id ? 'ring-2 ring-offset-1 ring-slate-800 dark:ring-offset-slate-900' : ''}`}
                         />
                       ))}
                     </div>
                   </div>
                 </div>
               )}

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {teams.map(team => (
                   <div key={team.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900">
                     <div className="flex flex-col mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                       {editingTeamId === team.id ? (
                         <div className="flex flex-col gap-2">
                           <div className="flex items-center gap-2">
                             <input 
                                value={editTeamName}
                                onChange={e => setEditTeamName(e.target.value)}
                                className="px-2 py-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded flex-1"
                             />
                             <button onClick={handleUpdateTeamName} className="text-xs px-2 py-1 bg-blue-600 text-white rounded">저장</button>
                             <button onClick={() => setEditingTeamId(null)} className="text-xs px-2 py-1 bg-slate-200 text-slate-700 rounded">취소</button>
                           </div>
                           <div className="flex items-center gap-2">
                             <span className="text-xs font-semibold text-slate-500">팀 컬러:</span>
                             <div className="flex gap-1.5">
                               {PRESET_COLORS.map(c => (
                                 <button 
                                   key={c.id} 
                                   onClick={() => setEditTeamColor(c.id)}
                                   className={`w-4 h-4 rounded-full ${c.bgClass} ${editTeamColor === c.id ? 'ring-2 ring-offset-1 ring-slate-800 dark:ring-offset-slate-900' : ''}`}
                                 />
                               ))}
                             </div>
                           </div>
                         </div>
                       ) : (
                         <div className="flex items-center justify-between">
                           <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                             <span className={`w-3 h-3 rounded-full ${PRESET_COLORS.find(c => c.id === (team.color || 'slate'))?.bgClass}`}></span>
                             {team.name}
                           </h3>
                           <div className="flex items-center gap-1">
                             <button onClick={() => { setEditingTeamId(team.id); setEditTeamName(team.name); setEditTeamColor(team.color || 'slate'); }} className="p-1 text-slate-400 hover:text-blue-500"><Edit2 size={13}/></button>
                             <button onClick={() => handleDeleteTeam(team.id, team.name)} className="p-1 text-slate-400 hover:text-rose-500"><Trash2 size={13}/></button>
                           </div>
                         </div>
                       )}
                     </div>
                     
                     <div className="space-y-2">
                        {team.members.map(m => (
                          <div key={m.id} className="flex justify-between items-center text-sm px-2 py-1 bg-slate-50 dark:bg-slate-800/50 rounded">
                            <span className="text-slate-700 dark:text-slate-300">{m.name}</span>
                            <button onClick={() => handleDeleteMember(team, m.id)} className="text-slate-400 hover:text-rose-500"><X size={12}/></button>
                          </div>
                        ))}
                        
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/50 block">
                           <input 
                             placeholder="새 팀원 이름"
                             className="flex-1 px-2 py-1 text-xs rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none"
                             onKeyDown={e => {
                               if (e.key === 'Enter') {
                                 setNewMemberName(e.currentTarget.value);
                                 handleAddMember(team);
                                 e.currentTarget.value = '';
                               }
                             }}
                             onChange={e => setNewMemberName(e.target.value)}
                           />
                           <button onClick={() => handleAddMember(team)} className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-slate-700 dark:text-slate-300">추가</button>
                        </div>
                     </div>
                   </div>
                 ))}
               </div>
             </>
          )}
        </div>
      </div>
    </div>
  );
}
