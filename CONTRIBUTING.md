# Contributing to PT-Portal

> **Developed by Rathobixz Inc.**

Thank you for your interest in contributing to PT-Portal! This document provides guidelines and instructions for contributing.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Coding Standards](#coding-standards)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

---

## 📜 Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors.

### Our Standards

✅ **Do:**

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the project
- Show empathy towards others

❌ **Don't:**

- Use inappropriate language
- Engage in personal attacks
- Harass or discriminate
- Publish others' private information

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- Git installed
- GitHub account
- VS Code (recommended)

### Setup

1. **Fork the repository**

   ```bash
   # Click "Fork" on GitHub
   ```

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/pt-portal.git
   cd pt-portal
   ```

3. **Add upstream remote**

   ```bash
   git remote add upstream https://github.com/PiyamDev1/pt-portal.git
   ```

4. **Install dependencies**

   ```bash
   npm install
   ```

5. **Create environment file**

   ```bash
   cp .env.example .env.local
   # Add your Supabase credentials
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

---

## 🔄 Development Process

### 1. Create a Branch

Always create a new branch for your work:

```bash
# For new features
git checkout -b feature/your-feature-name

# For bug fixes
git checkout -b fix/bug-description

# For documentation
git checkout -b docs/what-you-are-documenting
```

### 2. Make Changes

- Write clean, readable code
- Follow existing code style
- Add comments for complex logic
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run linter
npm run lint

# Run unit tests
npm run test:unit

# Verify formatting
npm run format:check

# Build the project
npm run build

# Test locally
npm run dev
```

### 4. Commit Your Changes

Use clear, descriptive commit messages:

```bash
# Good commit messages
git commit -m "Add payment receipt export feature"
git commit -m "Fix infinite loop in LMS pagination"
git commit -m "Update USAGE_GUIDE with new features"

# Bad commit messages
git commit -m "Fixed stuff"
git commit -m "Updates"
git commit -m "WIP"
```

**Commit Message Format:**

```
<type>: <subject>

<body (optional)>

<footer (optional)>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding tests
- `chore`: Maintenance tasks

**Example:**

```
feat: Add export to Excel functionality in LMS

- Added ExcelJS dependency
- Created export hook
- Added export button to UI
- Updated documentation

Closes #123
```

---

## 💻 Coding Standards

### TypeScript

✅ **Do:**

```typescript
// Use explicit types
interface User {
  id: string
  name: string
  email: string
}

function getUser(id: string): Promise<User> {
  // ...
}

// Use const for variables that won't change
const MAX_RETRIES = 3
```

❌ **Don't:**

```typescript
// Don't use 'any'
function getData(): any {}

// Don't use var
var count = 0
```

### React Components

✅ **Do:**

```typescript
// Use functional components
export default function MyComponent({ prop1, prop2 }: Props) {
  return <div>{prop1}</div>
}

// Use React.memo for performance
export default memo(MyComponent)

// Use proper hooks
const [state, setState] = useState<Type>(initialValue)
const memoizedValue = useMemo(() => computeValue(), [deps])
```

❌ **Don't:**

```typescript
// Don't use class components (unless necessary)
class MyComponent extends React.Component {}

// Don't ignore useEffect dependencies
useEffect(() => {
  doSomething(value)
}, []) // Missing 'value' dependency
```

### File Organization

```
app/
├── api/              # API routes
├── components/       # Reusable components
├── hooks/            # Custom hooks
├── lib/              # Utilities
├── types/            # Type definitions
└── [feature]/        # Feature-specific code
    ├── page.tsx      # Page component
    ├── client.tsx    # Client component
    └── components/   # Feature components
```

### Naming Conventions

- **Files**: `kebab-case.ts` or `PascalCase.tsx` for components
- **Components**: `PascalCase`
- **Functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

---

## 📤 Submitting Changes

### Pull Request Process

1. **Update your branch**

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push to your fork**

   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create Pull Request**
   - Go to GitHub
   - Click "New Pull Request"
   - Select your branch
   - Fill out the PR template

### Pull Request Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Tested locally
- [ ] Build passes
- [ ] No TypeScript errors
- [ ] Linter passes

## Screenshots (if applicable)

Add screenshots here

## Checklist

- [ ] Code follows project style
- [ ] Documentation updated
- [ ] No console errors
- [ ] Tested on different browsers
```

### Code Review

- Be responsive to feedback
- Make requested changes promptly
- Ask questions if unclear
- Be patient and respectful

---

## 🐛 Reporting Bugs

### Before Reporting

1. Check existing issues
2. Try latest version
3. Search documentation

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:

1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
Add screenshots if applicable.

**Environment:**

- OS: [e.g., Windows 11]
- Browser: [e.g., Chrome 120]
- Node version: [e.g., 18.17.0]

**Additional context**
Any other information about the problem.
```

---

## 💡 Feature Requests

### Before Requesting

1. Check existing feature requests
2. Consider if it fits the project scope
3. Think about implementation

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
Clear description of what you want to happen.

**Describe alternatives considered**
Other solutions or features you've considered.

**Additional context**
Any other context or screenshots.
```

---

## 📝 Documentation

### When to Update Docs

- Adding new features
- Changing existing features
- Fixing bugs that affect usage
- Improving setup process

### Documentation Files

- `README.md` - Project overview
- `docs/guides/USAGE_GUIDE.md` - User guide
- `docs/guides/ARCHITECTURE_GUIDE.md` - Technical docs
- `docs/guides/WINDOWS_SETUP_GUIDE.md` - Setup guide
- `CHANGELOG.md` - Version history

---

## 🎯 Good First Issues

Look for issues tagged with:

- `good first issue`
- `help wanted`
- `documentation`

---

## 📞 Questions?

- **Documentation**: Check [docs/](docs/)
- **GitHub Discussions**: Ask questions
- **Issues**: Report bugs/requests
- **Email**: support@ptportal.com

---

## 🙏 Recognition

Contributors are recognized in:

- GitHub contributors list
- CHANGELOG.md for significant contributions
- README.md for major features

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**© 2026 Rathobixz Inc. All rights reserved.**

Thank you for contributing to PT-Portal! 🎉
