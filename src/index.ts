import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { Resend } from 'resend'

type Bindings = {
  DB: D1Database,
  BUCKET: R2Bucket,
  RESEND_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()


app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin // allow non-browser requests (curl/Postman have no Origin header)

    const allowed = [
      'http://localhost:5173',        // Vite dev server
      'http://localhost:3000',        // in case you use a different dev port
      'https://my-api.ajoyjohnm.workers.dev',
      'https://arframe-tau.vercel.app',
    ]

    // Allow the fixed list, OR any preview deploy subdomain of your Pages or Vercel project
    const normalizedOrigin = origin.replace(/\/$/, '')
    if (
      allowed.includes(origin) ||
      allowed.includes(normalizedOrigin) ||
      normalizedOrigin.endsWith('.vercel.app') ||
      normalizedOrigin.endsWith('.pages.dev')
    ) {
      return origin
    }

    return null // reject anything else
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))




// app.get('/', (c) => {
//   return c.text('Hello Hono!')
// })

// CREATE
// app.post('/api/categories', async (c) => {
//   const body = await c.req.json()
//   const { category_name } = body

//   if (!category_name) {
//     return c.json(
//       { error: 'category_name is required' },
//       400
//     )
//   }

//   try {
//     const result = await c.env.DB
//       .prepare(
//         'INSERT INTO categories (category_name) VALUES (?)'
//       )
//       .bind(category_name)
//       .run()

//     return c.json({
//       message: 'Category created successfully',
//       id: result.meta.last_row_id,
//       category_name
//     }, 201)

//   } catch (error) {
//     return c.json({
//       error: 'Category already exists or database error'
//     }, 400)
//   }
// })


app.post('/api/categories', async (c) => {
  const body = await c.req.json()
  const { category_name } = body

  if (!category_name) {
    return c.json({
      error: 'category_name is required'
    }, 400)
  }

  try {
    const result = await c.env.DB
      .prepare(
        'INSERT INTO categories (category_name) VALUES (?)'
      )
      .bind(category_name)
      .run()

    return c.json({
      message: 'Category created successfully',
      id: result.meta.last_row_id,
      category_name
    }, 201)

  } catch (error) {
    console.error('D1 ERROR:', error)

    return c.json({
      error: String(error)
    }, 500)
  }
})


// GET ALL
app.get('/api/categories', async (c) => {

  const result = await c.env.DB
    .prepare(
      'SELECT * FROM categories ORDER BY id DESC'
    )
    .all()

  return c.json({
    data: result.results
  })
})


// GET ONE
app.get('/api/categories/:id', async (c) => {

  const id = c.req.param('id')

  const category = await c.env.DB
    .prepare(
      'SELECT * FROM categories WHERE id = ?'
    )
    .bind(id)
    .first()

  if (!category) {
    return c.json({
      error: 'Category not found'
    }, 404)
  }

  return c.json({
    data: category
  })
})


// UPDATE
app.put('/api/categories/:id', async (c) => {

  const id = c.req.param('id')
  const body = await c.req.json()
  const { category_name } = body

  if (!category_name) {
    return c.json({
      error: 'category_name is required'
    }, 400)
  }

  const result = await c.env.DB
    .prepare(
      'UPDATE categories SET category_name = ? WHERE id = ?'
    )
    .bind(category_name, id)
    .run()

  if (result.meta.changes === 0) {
    return c.json({
      error: 'Category not found'
    }, 404)
  }

  return c.json({
    message: 'Category updated successfully'
  })
})


// DELETE
app.delete('/api/categories/:id', async (c) => {

  const id = c.req.param('id')

  const result = await c.env.DB
    .prepare(
      'DELETE FROM categories WHERE id = ?'
    )
    .bind(id)
    .run()

  if (result.meta.changes === 0) {
    return c.json({
      error: 'Category not found'
    }, 404)
  }

  return c.json({
    message: 'Category deleted successfully'
  })
})


// for projects

// Helper to safely parse array fields from Hono body parser
function parseArrayField<T>(field: unknown): T[] {
  if (!field) return []
  if (Array.isArray(field)) return field as T[]
  return [field as T]
}

// Helper to safely parse images JSON string from D1 database
function parseImagesArray(imagesJson: string | null | undefined, coverImage: string | null | undefined): string[] {
  if (imagesJson) {
    try {
      const parsed = JSON.parse(imagesJson)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    } catch {
      return [imagesJson]
    }
  }
  return coverImage ? [coverImage] : []
}

// =====================================================
// CREATE PROJECT
// POST /api/projects
// =====================================================
app.post('/api/projects', async (c) => {
  try {
    const body = await c.req.parseBody({ all: true })

    const categoryId = body['category_id']
    const projectName = body['project_name']
    const description = body['description'] ? String(body['description']).trim() : null
    const client = body['client'] ? String(body['client']).trim() : null
    const location = body['location'] ? String(body['location']).trim() : null
    const builtupArea = body['builtup_area'] ? String(body['builtup_area']).trim() : null
    const landArea = body['land_area'] ? String(body['land_area']).trim() : null

    // Collect all uploaded files from 'images' and 'image' fields
    const rawFiles = [
      ...parseArrayField(body['images']),
      ...parseArrayField(body['image'])
    ]

    const validFiles = rawFiles.filter((f): f is File => f instanceof File && f.size > 0)

    // Validation
    if (!categoryId) {
      return c.json({ error: 'category_id is required' }, 400)
    }

    if (!projectName || typeof projectName !== 'string') {
      return c.json({ error: 'project_name is required' }, 400)
    }

    if (validFiles.length === 0) {
      return c.json({ error: 'Please select at least one project photo' }, 400)
    }

    // Check category exists
    const category = await c.env.DB
      .prepare('SELECT id FROM categories WHERE id = ?')
      .bind(categoryId)
      .first()

    if (!category) {
      return c.json({ error: 'Category not found' }, 404)
    }

    // Insert project record into D1
    const project = await c.env.DB
      .prepare(`
        INSERT INTO projects
        (category_id, project_name, description, client, location, builtup_area, land_area)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        categoryId,
        String(projectName).trim(),
        description,
        client,
        location,
        builtupArea,
        landArea
      )
      .run()

    const projectId = project.meta.last_row_id
    // Upload valid image files to Cloudflare R2 concurrently
    const uploadPromises = validFiles.map(async (file, i) => {
      const originalName = file.name || 'image.webp'
      const extension = originalName.includes('.')
        ? originalName.split('.').pop()?.toLowerCase() || 'webp'
        : 'webp'

      const imageKey = `projects/${projectId}_${Date.now()}_${i}.${extension}`

      await c.env.BUCKET.put(imageKey, file.stream(), {
        httpMetadata: { contentType: file.type || 'image/jpeg' }
      })

      return imageKey
    })

    const uploadedImageKeys = await Promise.all(uploadPromises)

    const coverImageKey = uploadedImageKeys[0] || null
    const imagesJson = JSON.stringify(uploadedImageKeys)

    // Update D1 with R2 keys
    await c.env.DB
      .prepare(`
        UPDATE projects
        SET project_image = ?, images = ?
        WHERE id = ?
      `)
      .bind(coverImageKey, imagesJson, projectId)
      .run()

    return c.json({
      message: 'Project created successfully',
      data: {
        id: projectId,
        category_id: categoryId,
        project_name: String(projectName).trim(),
        description,
        client,
        location,
        builtup_area: builtupArea,
        land_area: landArea,
        project_image: coverImageKey,
        images: uploadedImageKeys
      }
    }, 201)

  } catch (error) {
    console.error('CREATE PROJECT ERROR:', error)
    return c.json({ error: 'Failed to create project: ' + String(error) }, 500)
  }
})

// =====================================================
// GET SINGLE PROJECT
// GET /api/projects/:id
// =====================================================
app.get('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const project = await c.env.DB
      .prepare(`
        SELECT
          projects.id,
          projects.project_name,
          projects.project_image,
          projects.category_id,
          categories.category_name,
          projects.description,
          projects.client,
          projects.location,
          projects.builtup_area,
          projects.land_area,
          projects.images
        FROM projects
        JOIN categories ON projects.category_id = categories.id
        WHERE projects.id = ?
      `)
      .bind(id)
      .first<{
        id: number
        project_name: string
        project_image: string | null
        category_id: number
        category_name: string
        description: string | null
        client: string | null
        location: string | null
        builtup_area: string | null
        land_area: string | null
        images: string | null
      }>()

    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    const imagesArray = parseImagesArray(project.images, project.project_image)

    return c.json({
      data: {
        ...project,
        images: imagesArray
      }
    })

  } catch (error) {
    console.error('GET PROJECT ERROR:', error)
    return c.json({ error: 'Failed to fetch project' }, 500)
  }
})

// =====================================================
// UPDATE PROJECT
// PUT /api/projects/:id
// =====================================================
app.put('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.parseBody({ all: true })

    const categoryId = body['category_id']
    const projectName = body['project_name']
    const description = body['description'] ? String(body['description']).trim() : null
    const client = body['client'] ? String(body['client']).trim() : null
    const location = body['location'] ? String(body['location']).trim() : null
    const builtupArea = body['builtup_area'] ? String(body['builtup_area']).trim() : null
    const landArea = body['land_area'] ? String(body['land_area']).trim() : null

    // Check project exists
    const existingProject = await c.env.DB
      .prepare('SELECT * FROM projects WHERE id = ?')
      .bind(id)
      .first<{
        id: number
        project_image: string | null
        images: string | null
      }>()

    if (!existingProject) {
      return c.json({ error: 'Project not found' }, 404)
    }

    // Validation
    if (!categoryId) {
      return c.json({ error: 'category_id is required' }, 400)
    }

    if (!projectName || typeof projectName !== 'string') {
      return c.json({ error: 'project_name is required' }, 400)
    }

    // Check category exists
    const category = await c.env.DB
      .prepare('SELECT id FROM categories WHERE id = ?')
      .bind(categoryId)
      .first()

    if (!category) {
      return c.json({ error: 'Category not found' }, 404)
    }

    const coverImageKeyParam = body['cover_image_key'] ? String(body['cover_image_key']) : null

    // Process retained images
    const keptImageKeys = parseArrayField<string>(body['keep_images']).filter(k => typeof k === 'string' && k.length > 0)

    // Process new uploaded files concurrently
    const rawFiles = [
      ...parseArrayField(body['images']),
      ...parseArrayField(body['image'])
    ]
    const validNewFiles = rawFiles.filter((f): f is File => f instanceof File && f.size > 0)

    const uploadPromises = validNewFiles.map(async (file, i) => {
      const originalName = file.name || 'image.webp'
      const extension = originalName.includes('.')
        ? originalName.split('.').pop()?.toLowerCase() || 'webp'
        : 'webp'

      const imageKey = `projects/${id}_${Date.now()}_${i}.${extension}`

      await c.env.BUCKET.put(imageKey, file.stream(), {
        httpMetadata: { contentType: file.type || 'image/jpeg' }
      })

      return imageKey
    })

    const newlyUploadedKeys = await Promise.all(uploadPromises)

    const rawFinalKeys = [...keptImageKeys, ...newlyUploadedKeys]

    if (rawFinalKeys.length === 0) {
      return c.json({ error: 'A project must keep or add at least one photo.' }, 400)
    }

    let coverImageKey = rawFinalKeys[0]

    if (coverImageKeyParam) {
      if (coverImageKeyParam.startsWith('NEW_')) {
        const idx = parseInt(coverImageKeyParam.replace('NEW_', ''), 10)
        if (!isNaN(idx) && newlyUploadedKeys[idx]) {
          coverImageKey = newlyUploadedKeys[idx]
        }
      } else if (rawFinalKeys.includes(coverImageKeyParam)) {
        coverImageKey = coverImageKeyParam
      }
    }

    // Re-order final keys so cover image is first
    const otherKeys = rawFinalKeys.filter(key => key !== coverImageKey)
    const finalImageKeys = [coverImageKey, ...otherKeys]
    const imagesJson = JSON.stringify(finalImageKeys)

    // Update D1
    await c.env.DB
      .prepare(`
        UPDATE projects
        SET
          category_id = ?,
          project_name = ?,
          description = ?,
          client = ?,
          location = ?,
          builtup_area = ?,
          land_area = ?,
          project_image = ?,
          images = ?
        WHERE id = ?
      `)
      .bind(
        categoryId,
        String(projectName).trim(),
        description,
        client,
        location,
        builtupArea,
        landArea,
        coverImageKey,
        imagesJson,
        id
      )
      .run()

    // Delete any old R2 images that were removed in edit
    const previousKeys = parseImagesArray(existingProject.images, existingProject.project_image)
    const removedKeys = previousKeys.filter(key => !finalImageKeys.includes(key))

    for (const key of removedKeys) {
      try {
        await c.env.BUCKET.delete(key)
      } catch (err) {
        console.warn('Failed to delete old R2 key:', key, err)
      }
    }

    return c.json({
      message: 'Project updated successfully',
      data: {
        id,
        category_id: categoryId,
        project_name: String(projectName).trim(),
        description,
        client,
        location,
        builtup_area: builtupArea,
        land_area: landArea,
        project_image: coverImageKey,
        images: finalImageKeys
      }
    })

  } catch (error) {
    console.error('UPDATE PROJECT ERROR:', error)
    return c.json({ error: 'Failed to update project: ' + String(error) }, 500)
  }
})

// =====================================================
// DELETE PROJECT
// DELETE /api/projects/:id
// =====================================================
app.delete('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const project = await c.env.DB
      .prepare('SELECT project_image, images FROM projects WHERE id = ?')
      .bind(id)
      .first<{
        project_image: string | null
        images: string | null
      }>()

    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    // Delete database record
    await c.env.DB
      .prepare('DELETE FROM projects WHERE id = ?')
      .bind(id)
      .run()

    // Delete R2 images
    const keysToDelete = parseImagesArray(project.images, project.project_image)

    for (const key of keysToDelete) {
      try {
        await c.env.BUCKET.delete(key)
      } catch (err) {
        console.warn('Failed to delete R2 key:', key, err)
      }
    }

    return c.json({ message: 'Project deleted successfully' })

  } catch (error) {
    console.error('DELETE PROJECT ERROR:', error)
    return c.json({ error: 'Failed to delete project' }, 500)
  }
})

// =====================================================
// GET PROJECTS BY CATEGORY
// GET /api/categories/:categoryId/projects
// =====================================================
app.get('/api/categories/:categoryId/projects', async (c) => {
  try {
    const categoryId = c.req.param('categoryId')

    const category = await c.env.DB
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(categoryId)
      .first()

    if (!category) {
      return c.json({ error: 'Category not found' }, 404)
    }

    const result = await c.env.DB
      .prepare(`
        SELECT
          id,
          project_name,
          project_image,
          category_id,
          description,
          client,
          location,
          builtup_area,
          land_area,
          images
        FROM projects
        WHERE category_id = ?
        ORDER BY id DESC
      `)
      .bind(categoryId)
      .all<{
        id: number
        project_name: string
        project_image: string | null
        category_id: number
        description: string | null
        client: string | null
        location: string | null
        builtup_area: string | null
        land_area: string | null
        images: string | null
      }>()

    const formattedProjects = (result.results || []).map(row => ({
      ...row,
      images: parseImagesArray(row.images, row.project_image)
    }))

    return c.json({
      category,
      projects: formattedProjects
    })

  } catch (error) {
    console.error('GET CATEGORY PROJECTS ERROR:', error)
    return c.json({ error: 'Failed to fetch category projects' }, 500)
  }
})

// =====================================================
// GET ALL PROJECTS (PAGINATED)
// GET /api/projects
// =====================================================
app.get('/api/projects', async (c) => {
  try {
    const pageParam = c.req.query('page')
    const limitParam = c.req.query('limit')

    const page = Math.max(Number(pageParam) || 1, 1)
    const requestedLimit = Number(limitParam) || 5
    const limit = Math.min(Math.max(requestedLimit, 1), 100)
    const offset = (page - 1) * limit

    const countResult = await c.env.DB
      .prepare('SELECT COUNT(*) AS total FROM projects')
      .first<{ total: number }>()

    const total = countResult?.total ?? 0
    const totalPages = Math.ceil(total / limit)

    const result = await c.env.DB
      .prepare(`
        SELECT
          projects.id,
          projects.project_name,
          projects.project_image,
          projects.category_id,
          categories.category_name,
          projects.description,
          projects.client,
          projects.location,
          projects.builtup_area,
          projects.land_area,
          projects.images
        FROM projects
        JOIN categories ON projects.category_id = categories.id
        ORDER BY projects.id DESC
        LIMIT ? OFFSET ?
      `)
      .bind(limit, offset)
      .all<{
        id: number
        project_name: string
        project_image: string | null
        category_id: number
        category_name: string
        description: string | null
        client: string | null
        location: string | null
        builtup_area: string | null
        land_area: string | null
        images: string | null
      }>()

    const formattedProjects = (result.results || []).map(row => ({
      ...row,
      images: parseImagesArray(row.images, row.project_image)
    }))

    return c.json({
      page,
      limit,
      total,
      totalPages,
      data: formattedProjects
    })

  } catch (error) {
    console.error('GET PROJECTS PAGINATION ERROR:', error)
    return c.json({ error: 'Failed to fetch projects' }, 500)
  }
})


// facilties crud 

// =====================================================
// CREATE DESIGN EXCELLENCE
// POST /api/design-excellence
//
// Content-Type: multipart/form-data
//
// excellence_name
// excellence_description
// image
// =====================================================

app.post('/api/design-excellence', async (c) => {
  try {
    const body = await c.req.parseBody()

    const excellenceName = body['excellence_name']
    const excellenceDescription = body['excellence_description']
    const image = body['image']

    // -----------------------------
    // Validation
    // -----------------------------

    if (
      !excellenceName ||
      typeof excellenceName !== 'string'
    ) {
      return c.json({
        error: 'excellence_name is required'
      }, 400)
    }

    if (
      !excellenceDescription ||
      typeof excellenceDescription !== 'string'
    ) {
      return c.json({
        error: 'excellence_description is required'
      }, 400)
    }

    if (!(image instanceof File)) {
      return c.json({
        error: 'image is required'
      }, 400)
    }

    if (image.size === 0) {
      return c.json({
        error: 'Image cannot be empty'
      }, 400)
    }

    // -----------------------------
    // Create database record
    // -----------------------------

    const result = await c.env.DB
      .prepare(`
        INSERT INTO design_excellence
        (
          excellence_name,
          excellence_description
        )
        VALUES (?, ?)
      `)
      .bind(
        excellenceName.trim(),
        excellenceDescription.trim()
      )
      .run()

    const excellenceId = result.meta.last_row_id

    // -----------------------------
    // Get image extension
    // -----------------------------

    const originalName = image.name

    const extension = originalName.includes('.')
      ? originalName
        .split('.')
        .pop()
        ?.toLowerCase()
      : 'webp'

    // -----------------------------
    // R2 object key
    // -----------------------------

    const imageKey =
      `desighexcellence/${excellenceId}.${extension}`

    // -----------------------------
    // Upload image to R2
    // -----------------------------

    await c.env.BUCKET.put(
      imageKey,
      image.stream(),
      {
        httpMetadata: {
          contentType: image.type
        }
      }
    )

    // -----------------------------
    // Save R2 key in D1
    // -----------------------------

    await c.env.DB
      .prepare(`
        UPDATE design_excellence
        SET excellence_image = ?
        WHERE id = ?
      `)
      .bind(
        imageKey,
        excellenceId
      )
      .run()

    return c.json({
      message: 'Design excellence created successfully',

      data: {
        id: excellenceId,
        excellence_name: excellenceName.trim(),
        excellence_description:
          excellenceDescription.trim(),
        excellence_image: imageKey
      }
    }, 201)

  } catch (error) {

    console.error(
      'CREATE DESIGN EXCELLENCE ERROR:',
      error
    )

    return c.json({
      error: 'Failed to create design excellence'
    }, 500)
  }
})


// =====================================================
// GET ALL DESIGN EXCELLENCE
// GET /api/design-excellence
// =====================================================

app.get('/api/design-excellence', async (c) => {
  try {
    const pageParam = c.req.query('page')
    const limitParam = c.req.query('limit')

    const page = Math.max(
      Number(pageParam) || 1,
      1
    )

    const requestedLimit =
      Number(limitParam) || 10

    const limit = Math.min(
      Math.max(requestedLimit, 1),
      100
    )

    const offset = (page - 1) * limit

    // Get total count
    const countResult = await c.env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM design_excellence
      `)
      .first<{ total: number }>()

    const total = countResult?.total ?? 0

    const totalPages = Math.ceil(
      total / limit
    )

    // Get paginated records
    const result = await c.env.DB
      .prepare(`
        SELECT
          id,
          excellence_name,
          excellence_description,
          excellence_image
        FROM design_excellence
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `)
      .bind(limit, offset)
      .all()

    return c.json({
      page,
      limit,
      total,
      totalPages,
      data: result.results
    })

  } catch (error) {

    console.error(
      'GET DESIGN EXCELLENCE ERROR:',
      error
    )

    return c.json({
      error: 'Failed to fetch design excellence'
    }, 500)
  }
})


// =====================================================
// GET SINGLE DESIGN EXCELLENCE
// GET /api/design-excellence/:id
// =====================================================

app.get(
  '/api/design-excellence/:id',
  async (c) => {

    try {

      const id = c.req.param('id')

      const result = await c.env.DB
        .prepare(`
          SELECT
            id,
            excellence_name,
            excellence_description,
            excellence_image

          FROM design_excellence

          WHERE id = ?
        `)
        .bind(id)
        .first()

      if (!result) {
        return c.json({
          error: 'Design excellence not found'
        }, 404)
      }

      return c.json({
        data: result
      })

    } catch (error) {

      console.error(
        'GET DESIGN EXCELLENCE ERROR:',
        error
      )

      return c.json({
        error: 'Failed to fetch design excellence'
      }, 500)
    }
  }
)


// =====================================================
// UPDATE DESIGN EXCELLENCE
// PUT /api/design-excellence/:id
//
// Content-Type: multipart/form-data
//
// excellence_name
// excellence_description
// image (optional)
// =====================================================

app.put(
  '/api/design-excellence/:id',
  async (c) => {

    try {

      const id = c.req.param('id')

      const body = await c.req.parseBody()

      const excellenceName =
        body['excellence_name']

      const excellenceDescription =
        body['excellence_description']

      const image = body['image']

      // -----------------------------
      // Get existing record
      // -----------------------------

      const existing =
        await c.env.DB
          .prepare(`
            SELECT *
            FROM design_excellence
            WHERE id = ?
          `)
          .bind(id)
          .first<{
            id: number
            excellence_name: string
            excellence_description: string
            excellence_image: string | null
          }>()

      if (!existing) {
        return c.json({
          error: 'Design excellence not found'
        }, 404)
      }

      // -----------------------------
      // Validation
      // -----------------------------

      if (
        !excellenceName ||
        typeof excellenceName !== 'string'
      ) {
        return c.json({
          error: 'excellence_name is required'
        }, 400)
      }

      if (
        !excellenceDescription ||
        typeof excellenceDescription !== 'string'
      ) {
        return c.json({
          error: 'excellence_description is required'
        }, 400)
      }

      // =================================================
      // NO NEW IMAGE
      // =================================================

      if (!(image instanceof File)) {

        await c.env.DB
          .prepare(`
            UPDATE design_excellence

            SET
              excellence_name = ?,
              excellence_description = ?

            WHERE id = ?
          `)
          .bind(
            excellenceName.trim(),
            excellenceDescription.trim(),
            id
          )
          .run()

        return c.json({
          message:
            'Design excellence updated successfully'
        })
      }

      // =================================================
      // NEW IMAGE PROVIDED
      // =================================================

      if (image.size === 0) {
        return c.json({
          error: 'Image cannot be empty'
        }, 400)
      }

      // -----------------------------
      // Get extension
      // -----------------------------

      const originalName = image.name

      const extension = originalName.includes('.')
        ? originalName
          .split('.')
          .pop()
          ?.toLowerCase()
        : 'webp'

      // -----------------------------
      // New R2 key
      // -----------------------------

      const newImageKey =
        `desighexcellence/${id}.${extension}`

      // -----------------------------
      // Upload new image
      // -----------------------------

      await c.env.BUCKET.put(
        newImageKey,
        image.stream(),
        {
          httpMetadata: {
            contentType: image.type
          }
        }
      )

      try {

        // -----------------------------
        // Update database
        // -----------------------------

        await c.env.DB
          .prepare(`
            UPDATE design_excellence

            SET
              excellence_name = ?,
              excellence_description = ?,
              excellence_image = ?

            WHERE id = ?
          `)
          .bind(
            excellenceName.trim(),
            excellenceDescription.trim(),
            newImageKey,
            id
          )
          .run()

      } catch (dbError) {

        // Rollback new R2 upload

        await c.env.BUCKET.delete(
          newImageKey
        )

        throw dbError
      }

      // -----------------------------
      // Delete old image
      // -----------------------------

      if (
        existing.excellence_image &&
        existing.excellence_image !== newImageKey
      ) {

        await c.env.BUCKET.delete(
          existing.excellence_image
        )
      }

      return c.json({
        message:
          'Design excellence updated successfully',

        data: {
          id,
          excellence_name:
            excellenceName.trim(),
          excellence_description:
            excellenceDescription.trim(),
          excellence_image: newImageKey
        }
      })

    } catch (error) {

      console.error(
        'UPDATE DESIGN EXCELLENCE ERROR:',
        error
      )

      return c.json({
        error:
          'Failed to update design excellence'
      }, 500)
    }
  }
)


// =====================================================
// DELETE DESIGN EXCELLENCE
// DELETE /api/design-excellence/:id
// =====================================================

app.delete(
  '/api/design-excellence/:id',
  async (c) => {

    try {

      const id = c.req.param('id')

      // -----------------------------
      // Get record
      // -----------------------------

      const existing =
        await c.env.DB
          .prepare(`
            SELECT excellence_image
            FROM design_excellence
            WHERE id = ?
          `)
          .bind(id)
          .first<{
            excellence_image: string | null
          }>()

      if (!existing) {
        return c.json({
          error: 'Design excellence not found'
        }, 404)
      }

      // -----------------------------
      // Delete D1 record
      // -----------------------------

      await c.env.DB
        .prepare(`
          DELETE FROM design_excellence
          WHERE id = ?
        `)
        .bind(id)
        .run()

      // -----------------------------
      // Delete R2 image
      // -----------------------------

      if (existing.excellence_image) {

        await c.env.BUCKET.delete(
          existing.excellence_image
        )
      }

      return c.json({
        message:
          'Design excellence deleted successfully'
      })

    } catch (error) {

      console.error(
        'DELETE DESIGN EXCELLENCE ERROR:',
        error
      )

      return c.json({
        error:
          'Failed to delete design excellence'
      }, 500)
    }
  }
)




app.post('/api/login', async (c) => {
  try {
    const body = await c.req.json()

    const { username, password } = body

    if (!username || !password) {
      return c.json({
        error: 'Username and password are required'
      }, 400)
    }

    const user = await c.env.DB
      .prepare(`
        SELECT id, username
        FROM users
        WHERE username = ?
        AND password = ?
      `)
      .bind(username, password)
      .first<{
        id: number
        username: string
      }>()

    if (!user) {
      return c.json({
        error: 'Invalid username or password'
      }, 401)
    }

    return c.json({
      message: 'Login successful',
      user_id: user.id
    })

  } catch (error) {

    console.error('LOGIN ERROR:', error)

    return c.json({
      error: 'Login failed'
    }, 500)
  }
})


// Helper function to initialize D1 hero_images defaults if empty
async function ensureHeroImagesTable(db: D1Database) {
  try {
    const countRow = await db.prepare('SELECT COUNT(*) as cnt FROM hero_images').first<{ cnt: number }>();
    if (!countRow || countRow.cnt === 0) {
      const defaults = [
        { page: 'home', url: '/HERO/Hero1.jpg', order: 0, first: 1 },
        { page: 'home', url: '/HERO/hero2.jpg', order: 1, first: 0 },
        { page: 'home', url: '/HERO/hero3.jpg', order: 2, first: 0 },
        { page: 'home', url: '/HERO/hero4.jpg', order: 3, first: 0 },
        { page: 'home', url: '/HERO/hero5.jpg', order: 4, first: 0 },
        { page: 'home', url: '/HERO/hero6.jpg', order: 5, first: 0 },
        { page: 'home', url: '/HERO/hero7.jpg', order: 6, first: 0 },
        { page: 'projects', url: '/pagehero/projectshero.jpg', order: 0, first: 1 },
        { page: 'about', url: '/pagehero/aboutushero.jpg', order: 0, first: 1 },
        { page: 'contact', url: '/pagehero/aboutushero.jpg', order: 0, first: 1 },
      ];
      for (const d of defaults) {
        await db
          .prepare('INSERT INTO hero_images (page, image_url, display_order, is_first) VALUES (?, ?, ?, ?)')
          .bind(d.page, d.url, d.order, d.first)
          .run();
      }
    }
  } catch (e) {
    console.warn('ensureHeroImagesTable warning:', e);
  }
}

// GET Hero Images
app.get('/api/hero-images', async (c) => {
  try {
    await ensureHeroImagesTable(c.env.DB);
    const result = await c.env.DB
      .prepare('SELECT * FROM hero_images ORDER BY display_order ASC, id ASC')
      .all<{
        id: number;
        page: string;
        image_url: string;
        display_order: number;
        is_first: number;
        created_at: string;
      }>();

    const items = result.results || [];
    const homeItems = items.filter((i) => i.page === 'home');
    const projectsItem = items.find((i) => i.page === 'projects');
    const aboutItem = items.find((i) => i.page === 'about');
    const contactItem = items.find((i) => i.page === 'contact');

    // Find image set as first or fallback to index 0
    const firstHome = homeItems.find((i) => i.is_first === 1) || homeItems[0];

    const data = {
      home_hero: {
        images: homeItems.map((i) => i.image_url),
        first_image: firstHome ? firstHome.image_url : '/HERO/Hero1.jpg',
        items: homeItems,
      },
      projects_hero: projectsItem
        ? { image: projectsItem.image_url, id: projectsItem.id, is_first: projectsItem.is_first }
        : { image: '/pagehero/projectshero.jpg' },
      about_hero: aboutItem
        ? { image: aboutItem.image_url, id: aboutItem.id, is_first: aboutItem.is_first }
        : { image: '/pagehero/aboutushero.jpg' },
      contact_hero: contactItem
        ? { image: contactItem.image_url, id: contactItem.id, is_first: contactItem.is_first }
        : { image: '/pagehero/aboutushero.jpg' },
    };

    return c.json({ success: true, data });
  } catch (error) {
    console.error('GET HERO IMAGES ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// PUT /api/hero-images/:id/set-first (Set an image as first)
app.put('/api/hero-images/:id/set-first', async (c) => {
  try {
    await ensureHeroImagesTable(c.env.DB);
    const id = c.req.param('id');
    const target = await c.env.DB
      .prepare('SELECT * FROM hero_images WHERE id = ?')
      .bind(id)
      .first<{ id: number; page: string; image_url: string }>();

    if (!target) {
      return c.json({ error: 'Hero image not found' }, 404);
    }

    // 1. Reset is_first for all images on this page
    await c.env.DB
      .prepare('UPDATE hero_images SET is_first = 0 WHERE page = ?')
      .bind(target.page)
      .run();

    // 2. Set target as is_first = 1 and display_order = 0
    await c.env.DB
      .prepare('UPDATE hero_images SET is_first = 1, display_order = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(id)
      .run();

    // 3. Shift remaining images' display_order for this page
    const pageItems = await c.env.DB
      .prepare('SELECT id FROM hero_images WHERE page = ? AND id != ? ORDER BY display_order ASC, id ASC')
      .bind(target.page, id)
      .all<{ id: number }>();

    let idx = 1;
    for (const item of pageItems.results || []) {
      await c.env.DB
        .prepare('UPDATE hero_images SET display_order = ? WHERE id = ?')
        .bind(idx++, item.id)
        .run();
    }

    return c.json({ success: true, message: 'Image set as first successfully', id: target.id, page: target.page });
  } catch (error) {
    console.error('SET FIRST HERO IMAGE ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// PUT /api/hero-images (Bulk save / sync hero images from Admin form into D1 and R2 Heroimages folder)
app.put('/api/hero-images', async (c) => {
  try {
    await ensureHeroImagesTable(c.env.DB);
    const formData = await c.req.formData();

    // 1. Process Home Carousel Images
    const homeTotalItemsStr = formData.get('home_total_items');
    const finalHomeUrls: string[] = [];

    if (homeTotalItemsStr) {
      const total = parseInt(homeTotalItemsStr as string, 10) || 0;
      for (let i = 0; i < total; i++) {
        const type = formData.get(`home_item_${i}_type`);
        if (type === 'new') {
          const file = formData.get(`home_item_${i}_file`) as File | null;
          if (file && typeof file === 'object' && 'name' in file && file.size > 0) {
            const originalName = file.name || 'image.webp';
            const extension = originalName.includes('.')
              ? originalName.split('.').pop()?.toLowerCase() || 'webp'
              : 'webp';
            const imageKey = `Heroimages/home_${Date.now()}_${i}.${extension}`;
            await c.env.BUCKET.put(imageKey, file.stream(), {
              httpMetadata: { contentType: file.type || 'image/jpeg' },
            });
            finalHomeUrls.push(imageKey);
          }
        } else {
          const url = formData.get(`home_item_${i}_url`) as string | null;
          if (url && !url.startsWith('data:')) {
            finalHomeUrls.push(url);
          }
        }
      }
    } else {
      // Fallback: handle legacy home_keep_images & home_new_images
      const homeKeeps = formData.getAll('home_keep_images') as string[];
      const homeNews = formData.getAll('home_new_images') as File[];

      for (const keepUrl of homeKeeps) {
        if (keepUrl && !keepUrl.startsWith('data:')) {
          finalHomeUrls.push(keepUrl);
        }
      }

      for (let i = 0; i < homeNews.length; i++) {
        const file = homeNews[i];
        if (file && typeof file === 'object' && 'name' in file && file.size > 0) {
          const originalName = file.name || 'image.webp';
          const extension = originalName.includes('.')
            ? originalName.split('.').pop()?.toLowerCase() || 'webp'
            : 'webp';
          const imageKey = `Heroimages/home_${Date.now()}_${i}.${extension}`;
          await c.env.BUCKET.put(imageKey, file.stream(), {
            httpMetadata: { contentType: file.type || 'image/jpeg' },
          });
          finalHomeUrls.push(imageKey);
        }
      }
    }

    if (finalHomeUrls.length > 0) {
      await c.env.DB.prepare("DELETE FROM hero_images WHERE page = 'home'").run();

      for (let i = 0; i < finalHomeUrls.length; i++) {
        const url = finalHomeUrls[i];
        const isFirst = i === 0 ? 1 : 0;
        await c.env.DB
          .prepare('INSERT INTO hero_images (page, image_url, display_order, is_first) VALUES (?, ?, ?, ?)')
          .bind('home', url, i, isFirst)
          .run();
      }
    }

    // 2. Process Single Page Heroes (projects, about, contact)
    const singlePages = ['projects', 'about', 'contact'];
    for (const sp of singlePages) {
      const file = formData.get(`${sp}_image`) as File | null;
      const keep = formData.get(`${sp}_keep`) as string | null;

      let targetUrl = '';
      if (file && typeof file === 'object' && 'name' in file && file.size > 0) {
        const originalName = file.name || 'image.webp';
        const extension = originalName.includes('.')
          ? originalName.split('.').pop()?.toLowerCase() || 'webp'
          : 'webp';
        const imageKey = `Heroimages/${sp}_${Date.now()}.${extension}`;
        await c.env.BUCKET.put(imageKey, file.stream(), {
          httpMetadata: { contentType: file.type || 'image/jpeg' },
        });
        targetUrl = imageKey;
      } else if (keep) {
        targetUrl = keep;
      }

      if (targetUrl) {
        await c.env.DB.prepare('DELETE FROM hero_images WHERE page = ?').bind(sp).run();
        await c.env.DB
          .prepare('INSERT INTO hero_images (page, image_url, display_order, is_first) VALUES (?, ?, 0, 1)')
          .bind(sp, targetUrl)
          .run();
      }
    }

    return c.json({ success: true, message: 'Hero images saved successfully' });
  } catch (error) {
    console.error('SAVE HERO IMAGES ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// DELETE /api/hero-images/:id
app.delete('/api/hero-images/:id', async (c) => {
  try {
    await ensureHeroImagesTable(c.env.DB);
    const id = c.req.param('id');
    const target = await c.env.DB
      .prepare('SELECT image_url FROM hero_images WHERE id = ?')
      .bind(id)
      .first<{ image_url: string }>();

    if (target && target.image_url.startsWith('Heroimages/')) {
      try {
        await c.env.BUCKET.delete(target.image_url);
      } catch (err) {
        console.warn('R2 DELETE WARNING:', err);
      }
    }

    await c.env.DB.prepare('DELETE FROM hero_images WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: 'Hero image deleted' });
  } catch (error) {
    console.error('DELETE HERO IMAGE ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});


app.post('/api/contact', async (c) => {
  try {
    const body = await c.req.json()

    const {
      full_name,
      email,
      subject,
      message
    } = body

    // Validate required fields
    if (!full_name || !email || !subject || !message) {
      return c.json({
        error: 'All fields are required'
      }, 400)
    }

    // Create Resend instance
    const resend = new Resend(
      c.env.RESEND_API_KEY
    )

    // Send email
    const { data, error } =
      await resend.emails.send({
        from: 'AFrame Builders <onboarding@resend.dev>',

        // Your email where enquiries should arrive
        to: ['aframebuilders.ind@gmail.com'],

        subject: `New Enquiry: ${subject}`,

        text: `
New enquiry received from the AFrame Builders website.

Full Name:
${full_name}

Email Address:
${email}

Subject of Inquiry:
${subject}

Message:
${message}
        `
      })

    if (error) {
      console.error(
        'RESEND ERROR:',
        error
      )

      return c.json({
        error: 'Failed to send enquiry'
      }, 500)
    }

    return c.json({
      message: 'Enquiry sent successfully'
    }, 200)

  } catch (error) {

    console.error(
      'CONTACT ERROR:',
      error
    )

    return c.json({
      error: 'Invalid request'
    }, 400)
  }
})



// =====================================================
// BEFORE & AFTER (TRANSFORMATIONS)
// =====================================================

async function ensureBeforeAfterTable(db: D1Database) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS before_after (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Home Renovation',
        location TEXT,
        year TEXT,
        before_image TEXT NOT NULL,
        after_image TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (e) {
    console.warn('ensureBeforeAfterTable warning:', e);
  }
}

// GET /api/before-after
app.get('/api/before-after', async (c) => {
  try {
    await ensureBeforeAfterTable(c.env.DB);
    const pageParam = c.req.query('page');
    const limitParam = c.req.query('limit');

    if (!pageParam && !limitParam) {
      const result = await c.env.DB
        .prepare('SELECT * FROM before_after ORDER BY display_order ASC, id DESC')
        .all();
      return c.json({
        success: true,
        data: result.results || [],
        total: result.results ? result.results.length : 0,
      });
    }

    const page = Math.max(Number(pageParam) || 1, 1);
    const requestedLimit = Number(limitParam) || 10;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const offset = (page - 1) * limit;

    const countResult = await c.env.DB
      .prepare('SELECT COUNT(*) AS total FROM before_after')
      .first<{ total: number }>();
    const total = countResult?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    const result = await c.env.DB
      .prepare('SELECT * FROM before_after ORDER BY display_order ASC, id DESC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all();

    return c.json({
      success: true,
      page,
      limit,
      total,
      totalPages,
      data: result.results || [],
    });
  } catch (error) {
    console.error('GET BEFORE_AFTER ERROR:', error);
    return c.json({ error: 'Failed to fetch transformations' }, 500);
  }
});

// GET /api/before-after/:id
app.get('/api/before-after/:id', async (c) => {
  try {
    await ensureBeforeAfterTable(c.env.DB);
    const id = c.req.param('id');
    const item = await c.env.DB
      .prepare('SELECT * FROM before_after WHERE id = ?')
      .bind(id)
      .first();

    if (!item) {
      return c.json({ error: 'Transformation not found' }, 404);
    }

    return c.json({ success: true, data: item });
  } catch (error) {
    console.error('GET BEFORE_AFTER BY ID ERROR:', error);
    return c.json({ error: 'Failed to fetch transformation' }, 500);
  }
});

// POST /api/before-after
app.post('/api/before-after', async (c) => {
  try {
    await ensureBeforeAfterTable(c.env.DB);
    const body = await c.req.parseBody();

    const title = body['title'];
    const category = body['category'] || 'Home Renovation';
    const location = body['location'] || '';
    const year = body['year'] || new Date().getFullYear().toString();
    const beforeImage = body['before_image'];
    const afterImage = body['after_image'];

    if (!title || typeof title !== 'string' || !title.trim()) {
      return c.json({ error: 'title is required' }, 400);
    }

    if (!(beforeImage instanceof File) || beforeImage.size === 0) {
      return c.json({ error: 'Before image is required' }, 400);
    }

    if (!(afterImage instanceof File) || afterImage.size === 0) {
      return c.json({ error: 'After image is required' }, 400);
    }

    const getExtension = (file: File) => {
      const originalName = file.name || 'image.webp';
      return originalName.includes('.')
        ? originalName.split('.').pop()?.toLowerCase() || 'webp'
        : 'webp';
    };

    const timestamp = Date.now();
    const rand = Math.random().toString(36).substring(2, 7);
    const beforeKey = `beforeandafter/before_${timestamp}_${rand}.${getExtension(beforeImage)}`;
    const afterKey = `beforeandafter/after_${timestamp}_${rand}.${getExtension(afterImage)}`;

    // Upload to R2 in 'beforeandafter' folder
    await c.env.BUCKET.put(beforeKey, beforeImage.stream(), {
      httpMetadata: { contentType: beforeImage.type || 'image/jpeg' },
    });

    await c.env.BUCKET.put(afterKey, afterImage.stream(), {
      httpMetadata: { contentType: afterImage.type || 'image/jpeg' },
    });

    // Insert into D1
    const result = await c.env.DB
      .prepare(`
        INSERT INTO before_after (title, category, location, year, before_image, after_image)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        String(title).trim(),
        String(category).trim(),
        String(location).trim(),
        String(year).trim(),
        beforeKey,
        afterKey
      )
      .run();

    const newId = result.meta.last_row_id;
    return c.json({
      success: true,
      message: 'Transformation created successfully',
      data: {
        id: newId,
        title: String(title).trim(),
        category: String(category).trim(),
        location: String(location).trim(),
        year: String(year).trim(),
        before_image: beforeKey,
        after_image: afterKey,
      }
    }, 201);
  } catch (error) {
    console.error('CREATE BEFORE_AFTER ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// PUT /api/before-after/:id
app.put('/api/before-after/:id', async (c) => {
  try {
    await ensureBeforeAfterTable(c.env.DB);
    const id = c.req.param('id');
    const existing = await c.env.DB
      .prepare('SELECT * FROM before_after WHERE id = ?')
      .bind(id)
      .first<{
        id: number;
        title: string;
        category: string;
        location: string;
        year: string;
        before_image: string;
        after_image: string;
      }>();

    if (!existing) {
      return c.json({ error: 'Transformation not found' }, 404);
    }

    const body = await c.req.parseBody();
    const title = body['title'] !== undefined ? String(body['title']).trim() : existing.title;
    const category = body['category'] !== undefined ? String(body['category']).trim() : existing.category;
    const location = body['location'] !== undefined ? String(body['location']).trim() : existing.location;
    const year = body['year'] !== undefined ? String(body['year']).trim() : existing.year;
    const beforeImage = body['before_image'];
    const afterImage = body['after_image'];

    let finalBeforeKey = existing.before_image;
    let finalAfterKey = existing.after_image;

    const getExtension = (file: File) => {
      const originalName = file.name || 'image.webp';
      return originalName.includes('.')
        ? originalName.split('.').pop()?.toLowerCase() || 'webp'
        : 'webp';
    };

    const timestamp = Date.now();
    const rand = Math.random().toString(36).substring(2, 7);

    // If new before image uploaded
    if (beforeImage instanceof File && beforeImage.size > 0) {
      const newBeforeKey = `beforeandafter/before_${timestamp}_${rand}.${getExtension(beforeImage)}`;
      await c.env.BUCKET.put(newBeforeKey, beforeImage.stream(), {
        httpMetadata: { contentType: beforeImage.type || 'image/jpeg' },
      });

      // Delete old R2 key if it's in beforeandafter folder
      if (existing.before_image && existing.before_image.startsWith('beforeandafter/')) {
        try {
          await c.env.BUCKET.delete(existing.before_image);
        } catch (err) {
          console.warn('R2 DELETE OLD BEFORE IMAGE WARNING:', err);
        }
      }
      finalBeforeKey = newBeforeKey;
    }

    // If new after image uploaded
    if (afterImage instanceof File && afterImage.size > 0) {
      const newAfterKey = `beforeandafter/after_${timestamp}_${rand}.${getExtension(afterImage)}`;
      await c.env.BUCKET.put(newAfterKey, afterImage.stream(), {
        httpMetadata: { contentType: afterImage.type || 'image/jpeg' },
      });

      // Delete old R2 key if it's in beforeandafter folder
      if (existing.after_image && existing.after_image.startsWith('beforeandafter/')) {
        try {
          await c.env.BUCKET.delete(existing.after_image);
        } catch (err) {
          console.warn('R2 DELETE OLD AFTER IMAGE WARNING:', err);
        }
      }
      finalAfterKey = newAfterKey;
    }

    await c.env.DB
      .prepare(`
        UPDATE before_after
        SET title = ?, category = ?, location = ?, year = ?, before_image = ?, after_image = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(title, category, location, year, finalBeforeKey, finalAfterKey, id)
      .run();

    return c.json({
      success: true,
      message: 'Transformation updated successfully',
      data: {
        id,
        title,
        category,
        location,
        year,
        before_image: finalBeforeKey,
        after_image: finalAfterKey,
      }
    });
  } catch (error) {
    console.error('UPDATE BEFORE_AFTER ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// DELETE /api/before-after/:id
app.delete('/api/before-after/:id', async (c) => {
  try {
    await ensureBeforeAfterTable(c.env.DB);
    const id = c.req.param('id');
    const existing = await c.env.DB
      .prepare('SELECT * FROM before_after WHERE id = ?')
      .bind(id)
      .first<{
        id: number;
        before_image: string;
        after_image: string;
      }>();

    if (!existing) {
      return c.json({ error: 'Transformation not found' }, 404);
    }

    if (existing.before_image && existing.before_image.startsWith('beforeandafter/')) {
      try {
        await c.env.BUCKET.delete(existing.before_image);
      } catch (err) {
        console.warn('R2 DELETE BEFORE IMAGE WARNING:', err);
      }
    }

    if (existing.after_image && existing.after_image.startsWith('beforeandafter/')) {
      try {
        await c.env.BUCKET.delete(existing.after_image);
      } catch (err) {
        console.warn('R2 DELETE AFTER IMAGE WARNING:', err);
      }
    }

    await c.env.DB.prepare('DELETE FROM before_after WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: 'Transformation deleted successfully' });
  } catch (error) {
    console.error('DELETE BEFORE_AFTER ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// =====================================================
// PROPOSED AND ONGOING PROJECTS
// =====================================================

async function ensureProposedProjectsTable(db: D1Database) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS proposed_projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        subtitle TEXT,
        image TEXT NOT NULL,
        gallery TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Auto-migrate if table existed previously without the new columns
    const columns = ['subtitle TEXT', 'gallery TEXT'];
    for (const col of columns) {
      try {
        await db.prepare(`ALTER TABLE proposed_projects ADD COLUMN ${col}`).run();
      } catch (_) {
        // Column already exists, safe to ignore
      }
    }
  } catch (e) {
    console.warn('ensureProposedProjectsTable warning:', e);
  }
}

// GET /api/proposed-projects
app.get('/api/proposed-projects', async (c) => {
  try {
    await ensureProposedProjectsTable(c.env.DB);
    const result = await c.env.DB
      .prepare('SELECT * FROM proposed_projects ORDER BY id ASC')
      .all<{
        id: number;
        title: string;
        subtitle: string | null;
        image: string;
        gallery: string | null;
        created_at: string;
        updated_at: string;
      }>();

    const mapped = (result.results || []).map((row) => ({
      ...row,
      gallery: parseImagesArray(row.gallery, row.image),
    }));

    return c.json({
      success: true,
      data: mapped,
    });
  } catch (error) {
    console.error('GET PROPOSED_PROJECTS ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/proposed-projects/:id
app.get('/api/proposed-projects/:id', async (c) => {
  try {
    await ensureProposedProjectsTable(c.env.DB);
    const id = c.req.param('id');
    const project = await c.env.DB
      .prepare('SELECT * FROM proposed_projects WHERE id = ?')
      .bind(id)
      .first<{
        id: number;
        title: string;
        subtitle: string | null;
        image: string;
        gallery: string | null;
        created_at: string;
        updated_at: string;
      }>();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    return c.json({
      success: true,
      data: {
        ...project,
        gallery: parseImagesArray(project.gallery, project.image),
      },
    });
  } catch (error) {
    console.error('GET SINGLE PROPOSED_PROJECT ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/proposed-projects
app.post('/api/proposed-projects', async (c) => {
  try {
    await ensureProposedProjectsTable(c.env.DB);
    const body = await c.req.parseBody({ all: true });

    const title = body['title'];
    const subtitle = body['subtitle'] ? String(body['subtitle']).trim() : null;
    const imageFile = body['image'];
    const imageUrl = body['imageUrl'] || body['image_url'];

    if (!title || typeof title !== 'string' || !title.trim()) {
      return c.json({ error: 'Title is required' }, 400);
    }

    const getExtension = (file: File) => {
      const originalName = file.name || 'image.webp';
      return originalName.includes('.')
        ? originalName.split('.').pop()?.toLowerCase() || 'webp'
        : 'webp';
    };

    let finalCoverImage = '';

    if (imageFile instanceof File && imageFile.size > 0) {
      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 7);
      const imageKey = `proposed/cover_${timestamp}_${rand}.${getExtension(imageFile)}`;

      await c.env.BUCKET.put(imageKey, imageFile.stream(), {
        httpMetadata: { contentType: imageFile.type || 'image/jpeg' },
      });

      finalCoverImage = imageKey;
    } else if (typeof imageUrl === 'string' && imageUrl.trim()) {
      finalCoverImage = imageUrl.trim();
    }

    // Process Gallery
    const existingGalleryKeys = [
      ...parseArrayField<string>(body['keep_gallery']),
      ...parseArrayField<string>(body['existing_gallery']),
    ].filter((k) => typeof k === 'string' && k.trim().length > 0);

    const rawGalleryFiles = [
      ...parseArrayField(body['gallery_files']),
      ...parseArrayField(body['gallery']),
    ];
    const validGalleryFiles = rawGalleryFiles.filter(
      (f): f is File => f instanceof File && f.size > 0
    );

    const uploadGalleryPromises = validGalleryFiles.map(async (file, idx) => {
      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 7);
      const ext = getExtension(file);
      const key = `proposed/gallery_${timestamp}_${idx}_${rand}.${ext}`;
      await c.env.BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || 'image/jpeg' },
      });
      return key;
    });

    const newlyUploadedGalleryKeys = await Promise.all(uploadGalleryPromises);

    if (!finalCoverImage) {
      if (newlyUploadedGalleryKeys.length > 0) {
        finalCoverImage = newlyUploadedGalleryKeys[0];
      } else if (existingGalleryKeys.length > 0) {
        finalCoverImage = existingGalleryKeys[0];
      } else {
        return c.json({ error: 'At least a cover photo or gallery photo is required' }, 400);
      }
    }

    let finalGallery = [...existingGalleryKeys, ...newlyUploadedGalleryKeys];
    if (finalGallery.length === 0) {
      finalGallery = [finalCoverImage];
    }

    const galleryJson = JSON.stringify(finalGallery);

    const result = await c.env.DB
      .prepare(`
        INSERT INTO proposed_projects (title, subtitle, image, gallery)
        VALUES (?, ?, ?, ?)
      `)
      .bind(
        String(title).trim(),
        subtitle,
        finalCoverImage,
        galleryJson
      )
      .run();

    const newId = result.meta.last_row_id;
    return c.json({
      success: true,
      message: 'Proposed project created successfully',
      data: {
        id: newId,
        title: String(title).trim(),
        subtitle,
        image: finalCoverImage,
        gallery: finalGallery,
      },
    }, 201);
  } catch (error) {
    console.error('CREATE PROPOSED_PROJECT ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// PUT /api/proposed-projects/:id
app.put('/api/proposed-projects/:id', async (c) => {
  try {
    await ensureProposedProjectsTable(c.env.DB);
    const id = c.req.param('id');
    const existing = await c.env.DB
      .prepare('SELECT * FROM proposed_projects WHERE id = ?')
      .bind(id)
      .first<{
        id: number;
        title: string;
        subtitle: string | null;
        image: string;
        gallery: string | null;
      }>();

    if (!existing) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const body = await c.req.parseBody({ all: true });
    const title = body['title'] !== undefined ? String(body['title']).trim() : existing.title;
    const subtitle = body['subtitle'] !== undefined ? String(body['subtitle']).trim() : existing.subtitle;

    const imageFile = body['image'];
    const imageUrl = body['imageUrl'] || body['image_url'];

    const getExtension = (file: File) => {
      const originalName = file.name || 'image.webp';
      return originalName.includes('.')
        ? originalName.split('.').pop()?.toLowerCase() || 'webp'
        : 'webp';
    };

    let finalCoverImage = existing.image;
    let oldCoverToDelete: string | null = null;

    if (imageFile instanceof File && imageFile.size > 0) {
      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 7);
      const newKey = `proposed/cover_${timestamp}_${rand}.${getExtension(imageFile)}`;

      await c.env.BUCKET.put(newKey, imageFile.stream(), {
        httpMetadata: { contentType: imageFile.type || 'image/jpeg' },
      });

      if (existing.image && existing.image.startsWith('proposed/')) {
        oldCoverToDelete = existing.image;
      }
      finalCoverImage = newKey;
    } else if (typeof imageUrl === 'string' && imageUrl.trim()) {
      finalCoverImage = imageUrl.trim();
    }

    // Process Gallery
    const rawKeep = [
      ...parseArrayField<string>(body['keep_gallery']),
      ...parseArrayField<string>(body['existing_gallery']),
    ];

    const hasGalleryParam = 'keep_gallery' in body || 'existing_gallery' in body || 'gallery_files' in body || 'gallery' in body;
    let keptGalleryKeys: string[] = [];

    if (hasGalleryParam) {
      keptGalleryKeys = rawKeep.filter((k) => typeof k === 'string' && k.trim().length > 0);
    } else {
      keptGalleryKeys = parseImagesArray(existing.gallery, existing.image);
    }

    const rawGalleryFiles = [
      ...parseArrayField(body['gallery_files']),
      ...parseArrayField(body['gallery']),
    ];
    const validGalleryFiles = rawGalleryFiles.filter(
      (f): f is File => f instanceof File && f.size > 0
    );

    const uploadGalleryPromises = validGalleryFiles.map(async (file, idx) => {
      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 7);
      const ext = getExtension(file);
      const key = `proposed/gallery_${timestamp}_${idx}_${rand}.${ext}`;
      await c.env.BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || 'image/jpeg' },
      });
      return key;
    });

    const newlyUploadedGalleryKeys = await Promise.all(uploadGalleryPromises);

    let finalGallery = [...keptGalleryKeys, ...newlyUploadedGalleryKeys];
    if (finalGallery.length === 0) {
      finalGallery = [finalCoverImage];
    }

    // Delete any old R2 files that were removed
    const oldGalleryKeys = parseImagesArray(existing.gallery, existing.image);
    const keysToDelete = oldGalleryKeys.filter(
      (oldKey) =>
        oldKey.startsWith('proposed/') &&
        !finalGallery.includes(oldKey) &&
        oldKey !== finalCoverImage
    );

    if (oldCoverToDelete && !finalGallery.includes(oldCoverToDelete)) {
      keysToDelete.push(oldCoverToDelete);
    }

    for (const key of keysToDelete) {
      try {
        await c.env.BUCKET.delete(key);
      } catch (err) {
        console.warn('R2 DELETE OLD PROPOSED IMAGE WARNING:', err);
      }
    }

    const galleryJson = JSON.stringify(finalGallery);

    await c.env.DB
      .prepare(`
        UPDATE proposed_projects
        SET title = ?, subtitle = ?, image = ?, gallery = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(title, subtitle, finalCoverImage, galleryJson, id)
      .run();

    return c.json({
      success: true,
      message: 'Proposed project updated successfully',
      data: {
        id,
        title,
        subtitle,
        image: finalCoverImage,
        gallery: finalGallery,
      },
    });
  } catch (error) {
    console.error('UPDATE PROPOSED_PROJECT ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// DELETE /api/proposed-projects/:id
app.delete('/api/proposed-projects/:id', async (c) => {
  try {
    await ensureProposedProjectsTable(c.env.DB);
    const id = c.req.param('id');
    const existing = await c.env.DB
      .prepare('SELECT * FROM proposed_projects WHERE id = ?')
      .bind(id)
      .first<{ id: number; image: string; gallery: string | null }>();

    if (!existing) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const allKeys = [
      existing.image,
      ...parseImagesArray(existing.gallery, existing.image),
    ];
    const uniqueKeys = Array.from(new Set(allKeys)).filter(
      (k) => typeof k === 'string' && k.startsWith('proposed/')
    );

    for (const key of uniqueKeys) {
      try {
        await c.env.BUCKET.delete(key);
      } catch (err) {
        console.warn('R2 DELETE IMAGE WARNING:', err);
      }
    }

    await c.env.DB.prepare('DELETE FROM proposed_projects WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: 'Proposed project deleted successfully' });
  } catch (error) {
    console.error('DELETE PROPOSED_PROJECT ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// =====================================================
// GALLERY SHOWCASE API ENDPOINTS
// =====================================================

async function ensureGalleryTable(db: D1Database) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS gallery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Architecture',
        image TEXT NOT NULL,
        aspect TEXT DEFAULT 'tall',
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (e) {
    console.warn('ensureGalleryTable warning:', e);
  }
}

// GET /api/gallery (supports optional ?category=Architecture)
app.get('/api/gallery', async (c) => {
  try {
    await ensureGalleryTable(c.env.DB);
    const category = c.req.query('category');

    let query = 'SELECT * FROM gallery';
    let params: any[] = [];

    if (category && category !== 'All') {
      query += ' WHERE category = ?';
      params.push(category);
    }

    query += ' ORDER BY display_order ASC, id DESC';

    const stmt = params.length > 0 ? c.env.DB.prepare(query).bind(...params) : c.env.DB.prepare(query);
    const result = await stmt.all();

    return c.json({
      success: true,
      data: result.results || [],
    });
  } catch (error) {
    console.error('GET GALLERY ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// GET /api/gallery/:id
app.get('/api/gallery/:id', async (c) => {
  try {
    await ensureGalleryTable(c.env.DB);
    const id = c.req.param('id');
    const item = await c.env.DB
      .prepare('SELECT * FROM gallery WHERE id = ?')
      .bind(id)
      .first();

    if (!item) {
      return c.json({ error: 'Gallery item not found' }, 404);
    }

    return c.json({ success: true, data: item });
  } catch (error) {
    console.error('GET SINGLE GALLERY ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// POST /api/gallery (Multipart / Form-data or JSON)
app.post('/api/gallery', async (c) => {
  try {
    await ensureGalleryTable(c.env.DB);
    const body = await c.req.parseBody();

    const title = body['title'];
    const category = body['category'] || 'Architecture';
    const aspect = body['aspect'] || 'tall';
    const displayOrder = parseInt(String(body['display_order'] || '0'), 10) || 0;
    const imageFile = body['image'];
    const imageUrl = body['imageUrl'] || body['image_url'];

    if (!title || typeof title !== 'string' || !title.trim()) {
      return c.json({ error: 'Title is required' }, 400);
    }

    let finalImage = '';

    if (imageFile instanceof File && imageFile.size > 0) {
      const getExtension = (file: File) => {
        const originalName = file.name || 'image.webp';
        const parts = originalName.split('.');
        return parts.length > 1 ? parts.pop()!.toLowerCase() : 'webp';
      };

      const ext = getExtension(imageFile);
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      const key = `gallery/gallery_${Date.now()}_${randomSuffix}.${ext}`;

      const arrayBuffer = await imageFile.arrayBuffer();
      await c.env.BUCKET.put(key, arrayBuffer, {
        httpMetadata: {
          contentType: imageFile.type || 'image/jpeg',
        },
      });

      finalImage = key;
    } else if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
      finalImage = imageUrl.trim();
    } else {
      return c.json({ error: 'An image file or valid image URL is required' }, 400);
    }

    const insertResult = await c.env.DB
      .prepare(`
        INSERT INTO gallery (title, category, image, aspect, display_order)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(title.trim(), category, finalImage, aspect, displayOrder)
      .run();

    return c.json({
      success: true,
      message: 'Gallery item created successfully',
      data: {
        id: insertResult.meta?.last_row_id,
        title: title.trim(),
        category,
        image: finalImage,
        aspect,
        display_order: displayOrder,
      },
    }, 201);
  } catch (error) {
    console.error('CREATE GALLERY ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// PUT /api/gallery/:id
app.put('/api/gallery/:id', async (c) => {
  try {
    await ensureGalleryTable(c.env.DB);
    const id = c.req.param('id');
    const existing = await c.env.DB
      .prepare('SELECT * FROM gallery WHERE id = ?')
      .bind(id)
      .first<{ id: number; title: string; category: string; image: string; aspect: string; display_order: number }>();

    if (!existing) {
      return c.json({ error: 'Gallery item not found' }, 404);
    }

    const body = await c.req.parseBody();
    const title = typeof body['title'] === 'string' && body['title'].trim() ? body['title'].trim() : existing.title;
    const category = typeof body['category'] === 'string' && body['category'].trim() ? body['category'].trim() : existing.category;
    const aspect = typeof body['aspect'] === 'string' && body['aspect'].trim() ? body['aspect'].trim() : existing.aspect;
    const displayOrder = body['display_order'] !== undefined ? parseInt(String(body['display_order']), 10) : existing.display_order;

    const imageFile = body['image'];
    const imageUrl = body['imageUrl'] || body['image_url'];

    let finalImage = existing.image;

    if (imageFile instanceof File && imageFile.size > 0) {
      const getExtension = (file: File) => {
        const originalName = file.name || 'image.webp';
        const parts = originalName.split('.');
        return parts.length > 1 ? parts.pop()!.toLowerCase() : 'webp';
      };

      const ext = getExtension(imageFile);
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      const key = `gallery/gallery_${Date.now()}_${randomSuffix}.${ext}`;

      const arrayBuffer = await imageFile.arrayBuffer();
      await c.env.BUCKET.put(key, arrayBuffer, {
        httpMetadata: {
          contentType: imageFile.type || 'image/jpeg',
        },
      });

      if (existing.image && existing.image.startsWith('gallery/')) {
        try {
          await c.env.BUCKET.delete(existing.image);
        } catch (err) {
          console.warn('R2 DELETE PREVIOUS IMAGE WARNING:', err);
        }
      }

      finalImage = key;
    } else if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
      finalImage = imageUrl.trim();
    }

    await c.env.DB
      .prepare(`
        UPDATE gallery
        SET title = ?, category = ?, image = ?, aspect = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(title, category, finalImage, aspect, displayOrder, id)
      .run();

    return c.json({
      success: true,
      message: 'Gallery item updated successfully',
      data: {
        id,
        title,
        category,
        image: finalImage,
        aspect,
        display_order: displayOrder,
      },
    });
  } catch (error) {
    console.error('UPDATE GALLERY ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// DELETE /api/gallery/:id
app.delete('/api/gallery/:id', async (c) => {
  try {
    await ensureGalleryTable(c.env.DB);
    const id = c.req.param('id');
    const existing = await c.env.DB
      .prepare('SELECT * FROM gallery WHERE id = ?')
      .bind(id)
      .first<{ id: number; image: string }>();

    if (!existing) {
      return c.json({ error: 'Gallery item not found' }, 404);
    }

    if (existing.image && existing.image.startsWith('gallery/')) {
      try {
        await c.env.BUCKET.delete(existing.image);
      } catch (err) {
        console.warn('R2 DELETE IMAGE WARNING:', err);
      }
    }

    await c.env.DB.prepare('DELETE FROM gallery WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: 'Gallery item deleted successfully' });
  } catch (error) {
    console.error('DELETE GALLERY ERROR:', error);
    return c.json({ error: String(error) }, 500);
  }
});

export default app;

