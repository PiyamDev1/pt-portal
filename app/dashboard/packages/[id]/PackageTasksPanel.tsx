'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Check, Plus } from 'lucide-react'
import type { TravelPackageTask } from '@/app/types/packages'
import { formatDateTime } from './packageOperationsModel'

export type PackageTaskForm = {
  title: string
  dueAt: string
  priority: string
}

type PackageTasksPanelProps = {
  tasks: TravelPackageTask[]
  taskForm: PackageTaskForm
  setTaskForm: Dispatch<SetStateAction<PackageTaskForm>>
  onCreateTask: (body: Record<string, unknown>) => void | Promise<void>
  onUpdateTask: (taskId: string, body: Record<string, unknown>) => void | Promise<void>
}

export function PackageTasksPanel({
  tasks,
  taskForm,
  setTaskForm,
  onCreateTask,
  onUpdateTask,
}: PackageTasksPanelProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-black">Tasks</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void onCreateTask(taskForm)
        }}
        className="grid gap-2 border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_11rem_8rem_auto]"
      >
        <input
          placeholder="Task title"
          value={taskForm.title}
          onChange={(event) =>
            setTaskForm((current) => ({ ...current, title: event.target.value }))
          }
          className="border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <label className="text-[11px] font-bold uppercase text-slate-500">
          Due date
          <input
            type="datetime-local"
            value={taskForm.dueAt}
            onChange={(event) =>
              setTaskForm((current) => ({ ...current, dueAt: event.target.value }))
            }
            className="mt-1 w-full border border-slate-300 px-2 py-2 text-xs normal-case text-slate-900"
          />
        </label>
        <select
          value={taskForm.priority}
          onChange={(event) =>
            setTaskForm((current) => ({ ...current, priority: event.target.value }))
          }
          className="border border-slate-300 px-2 py-2 text-xs"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <button title="Add task" className="bg-slate-900 p-2 text-white">
          <Plus className="h-4 w-4" />
        </button>
      </form>
      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 border border-slate-200 p-3">
            <button
              title="Complete task"
              onClick={() =>
                void onUpdateTask(task.id, {
                  status: task.status === 'completed' ? 'open' : 'completed',
                })
              }
              className={`flex h-6 w-6 items-center justify-center border ${task.status === 'completed' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}
            >
              {task.status === 'completed' && <Check className="h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-bold ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}
              >
                {task.title}
              </p>
              <p className="text-xs text-slate-500">
                {task.due_at ? `Due ${formatDateTime(task.due_at)}` : 'No due date'} ·{' '}
                {task.priority}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
