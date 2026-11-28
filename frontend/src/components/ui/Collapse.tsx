import type { ReactNode } from 'react'

interface CollapseProps {
    isOpen: boolean
    children: ReactNode
}

const Collapse = ({ isOpen, children }: CollapseProps) => {
    return (
        <div
            className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
        >
            <div inert={!isOpen} className="min-h-0 overflow-hidden">
                {children}
            </div>
        </div>
    )
}

export default Collapse
